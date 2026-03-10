// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title LostAndFound
 * @dev A three-layer escrow system for lost and found items
 * Layer 1: Funding - Funds locked in escrow
 * Layer 2: Verification - Item delivery and confirmation
 * Layer 3: Resolution - Multi-sig release or dispute resolution
 */
contract LostAndFound {
    
    // ============ Roles ============
    address public admin;
    
    // ============ Reputation ============
    mapping(address => uint256) public reputation;
    
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can call this");
        _;
    }
    
    constructor() {
        admin = msg.sender;
    }
    
    function transferAdmin(address newAdmin) public onlyAdmin {
        require(newAdmin != address(0), "Invalid address");
        admin = newAdmin;
    }
    
    // ============ Enums ============
    enum EscrowState {
        None,
        Funded,              // Layer 1: Funds locked
        ClaimAssigned,       // Layer 1: Finder assigned
        AwaitingDelivery,    // Layer 2: Item in transit
        ItemDelivered,       // Layer 2: Item delivered
        AwaitingConfirmation,// Layer 2: Waiting for confirmations
        Disputed,            // Layer 3: Dispute raised
        Released,            // Layer 3: Funds released
        Refunded             // Layer 3: Funds refunded
    }
    
    // ============ Structs ============
    
    // Item struct for lost/found items
    struct Item {
        string id;
        string itemType; // "lost" or "found"
        address reporterAddress;
        string qrCodeHash;
        int256 latitude;  // Scaled by 1e6
        int256 longitude; // Scaled by 1e6
        uint256 rewardAmount;
        bool isClaimed;
        uint256 timestamp;
        string description;
        string metadataURI; // IPFS or decentralized storage link
        bytes32 secretHash; // ZKP-lite: Keccak256 hash of a secret item feature
    }
    
    // Match record struct
    struct MatchRecord {
        string lostItemId;
        string foundItemId;
        uint256 matchScore;
        uint256 timestamp;
    }

    // Three-Layer Escrow struct
    struct RewardEscrow {
        string itemId;
        uint256 amount;
        address depositor;
        address approvedFinder;
        EscrowState state;
        
        // Layer 2: Delivery tracking
        uint256 deliveryTimestamp;
        
        // Layer 2: Confirmations
        bool ownerConfirmed;
        bool finderConfirmed;
        
        // Layer 3: Multi-sig approvals (2-of-3 required)
        bool ownerApproved;
        bool finderApproved;
        bool adminApproved;
        
        // Layer 3: Time-lock
        uint256 autoReleaseTime;
        bool autoReleaseTriggered;
        
        // Layer 3: Dispute
        string disputeReason;
        address disputeRaisedBy;
        uint256 disputeTimestamp;
    }

    // ============ State Variables ============
    mapping(string => Item) public items;
    mapping(string => RewardEscrow) public rewards;
    mapping(string => string) public qrCodeToItemId;
    string[] public itemIds;
    MatchRecord[] public matches;
    
    // Time-lock configuration
    uint256 public constant AUTO_RELEASE_DELAY = 7 days;
    uint256 public constant DISPUTE_RESOLUTION_DELAY = 14 days;

    // ============ Events ============
    // Layer 1: Funding Events
    event ItemRegistered(
        string indexed itemId,
        string itemType,
        address indexed reporter,
        string qrCodeHash,
        int256 latitude,
        int256 longitude,
        uint256 rewardAmount
    );
    event RewardDeposited(string indexed itemId, uint256 amount, address indexed depositor);
    
    // Layer 1: Assignment Events
    event FinderAssigned(string indexed itemId, address indexed finder);
    
    // Layer 2: Delivery Events
    event DeliveryInitiated(string indexed itemId, address indexed finder, uint256 timestamp);
    event ItemDelivered(string indexed itemId, uint256 timestamp);
    event OwnerConfirmed(string indexed itemId, uint256 timestamp);
    event FinderConfirmed(string indexed itemId, uint256 timestamp);
    
    // Layer 3: Release Events
    event ReleaseApproved(string indexed itemId, address indexed approver, uint256 approvalCount);
    event RewardReleased(string indexed itemId, address indexed claimer, uint256 amount, uint256 timestamp);
    event RewardRefunded(string indexed itemId, address indexed depositor, uint256 amount, uint256 timestamp);
    event AutoReleaseTriggered(string indexed itemId, uint256 timestamp);
    
    // Layer 3: Dispute Events
    event DisputeRaised(string indexed itemId, address indexed raisedBy, string reason, uint256 timestamp);
    event DisputeResolved(string indexed itemId, string resolution, uint256 timestamp);
    
    // Match Events
    event MatchRecorded(string lostItemId, string foundItemId, uint256 matchScore, uint256 timestamp);
    event ClaimApproved(string indexed itemId, address indexed finder);

    // ============ Layer 1: Funding Functions ============
    
    // Register a new item (lost or found) with optional reward
    function registerItem(
        string memory _id,
        string memory _itemType,
        string memory _qrCodeHash,
        int256 _latitude,
        int256 _longitude,
        string memory _description,
        string memory _metadataURI,
        bytes32 _secretHash
    ) public payable {
        require(bytes(items[_id].id).length == 0, "Item already registered");
        require(bytes(_qrCodeHash).length > 0, "QR code hash required");
        
        items[_id] = Item({
            id: _id,
            itemType: _itemType,
            reporterAddress: msg.sender,
            qrCodeHash: _qrCodeHash,
            latitude: _latitude,
            longitude: _longitude,
            rewardAmount: msg.value,
            isClaimed: false,
            timestamp: block.timestamp,
            description: _description,
            metadataURI: _metadataURI,
            secretHash: _secretHash
        });
        
        itemIds.push(_id);
        qrCodeToItemId[_qrCodeHash] = _id;
        
        // If reward sent with registration, create escrow
        if (msg.value > 0) {
            rewards[_id] = RewardEscrow({
                itemId: _id,
                amount: msg.value,
                depositor: msg.sender,
                approvedFinder: address(0),
                state: EscrowState.Funded,
                deliveryTimestamp: 0,
                ownerConfirmed: false,
                finderConfirmed: false,
                ownerApproved: false,
                finderApproved: false,
                adminApproved: false,
                autoReleaseTime: 0,
                autoReleaseTriggered: false,
                disputeReason: "",
                disputeRaisedBy: address(0),
                disputeTimestamp: 0
            });
            emit RewardDeposited(_id, msg.value, msg.sender);
        }
        
        emit ItemRegistered(_id, _itemType, msg.sender, _qrCodeHash, _latitude, _longitude, msg.value);
    }

    // Deposit reward for an existing item
    function depositReward(string memory _itemId) public payable {
        require(bytes(items[_itemId].id).length > 0, "Item not found");
        require(items[_itemId].reporterAddress == msg.sender, "Only item owner can deposit reward");
        require(msg.value > 0, "Reward amount must be greater than 0");
        require(rewards[_itemId].state != EscrowState.Released && rewards[_itemId].state != EscrowState.Refunded, "Reward already finalized");
        
        if (rewards[_itemId].amount > 0) {
            // Add to existing reward
            rewards[_itemId].amount += msg.value;
        } else {
            // Create new reward escrow
            rewards[_itemId] = RewardEscrow({
                itemId: _itemId,
                amount: msg.value,
                depositor: msg.sender,
                approvedFinder: address(0),
                state: EscrowState.Funded,
                deliveryTimestamp: 0,
                ownerConfirmed: false,
                finderConfirmed: false,
                ownerApproved: false,
                finderApproved: false,
                adminApproved: false,
                autoReleaseTime: 0,
                autoReleaseTriggered: false,
                disputeReason: "",
                disputeRaisedBy: address(0),
                disputeTimestamp: 0
            });
        }
        
        items[_itemId].rewardAmount += msg.value;
        
        emit RewardDeposited(_itemId, msg.value, msg.sender);
    }
    
    // Assign finder to escrow (Layer 1 -> Layer 2 transition)
    function assignFinder(string memory _itemId, address _finder) public {
        require(bytes(items[_itemId].id).length > 0, "Item not found");
        require(items[_itemId].reporterAddress == msg.sender, "Only item owner can assign finder");
        require(rewards[_itemId].amount > 0, "No reward escrow");
        require(rewards[_itemId].state == EscrowState.Funded, "Invalid escrow state");
        require(_finder != address(0), "Invalid finder address");
        require(_finder != items[_itemId].reporterAddress, "Owner cannot be finder");
        
        rewards[_itemId].approvedFinder = _finder;
        rewards[_itemId].state = EscrowState.ClaimAssigned;
        
        emit FinderAssigned(_itemId, _finder);
    }

    // ============ Layer 2: Delivery & Verification Functions ============
    
    // Finder initiates delivery (Layer 1 -> Layer 2 transition)
    function initiateDelivery(string memory _itemId) public {
        require(bytes(items[_itemId].id).length > 0, "Item not found");
        require(rewards[_itemId].approvedFinder == msg.sender, "Only assigned finder can initiate delivery");
        require(rewards[_itemId].state == EscrowState.ClaimAssigned, "Invalid escrow state");
        
        rewards[_itemId].state = EscrowState.AwaitingDelivery;
        rewards[_itemId].deliveryTimestamp = block.timestamp;
        
        emit DeliveryInitiated(_itemId, msg.sender, block.timestamp);
    }
    
    // Finder marks item as delivered
    function markItemDelivered(string memory _itemId) public {
        require(bytes(items[_itemId].id).length > 0, "Item not found");
        require(rewards[_itemId].approvedFinder == msg.sender, "Only assigned finder can mark delivered");
        require(rewards[_itemId].state == EscrowState.AwaitingDelivery, "Invalid escrow state");
        
        rewards[_itemId].state = EscrowState.ItemDelivered;
        
        emit ItemDelivered(_itemId, block.timestamp);
    }
    
    // Owner confirms item received
    function confirmItemReceived(string memory _itemId) public {
        require(bytes(items[_itemId].id).length > 0, "Item not found");
        require(items[_itemId].reporterAddress == msg.sender, "Only item owner can confirm");
        require(!rewards[_itemId].ownerConfirmed, "Already confirmed");
        require(
            rewards[_itemId].state == EscrowState.ItemDelivered || 
            rewards[_itemId].state == EscrowState.AwaitingConfirmation,
            "Invalid escrow state"
        );
        
        rewards[_itemId].ownerConfirmed = true;
        if (rewards[_itemId].state == EscrowState.ItemDelivered) {
            rewards[_itemId].state = EscrowState.AwaitingConfirmation;
        }
        
        // Set auto-release timer if not already set
        if (rewards[_itemId].autoReleaseTime == 0) {
            rewards[_itemId].autoReleaseTime = block.timestamp + AUTO_RELEASE_DELAY;
        }
        
        emit OwnerConfirmed(_itemId, block.timestamp);
    }
    
    // Finder confirms (optional - for mutual confirmation)
    function confirmAsFinder(string memory _itemId) public {
        require(bytes(items[_itemId].id).length > 0, "Item not found");
        require(rewards[_itemId].approvedFinder == msg.sender, "Only assigned finder can confirm");
        require(!rewards[_itemId].finderConfirmed, "Already confirmed");
        
        rewards[_itemId].finderConfirmed = true;
        
        emit FinderConfirmed(_itemId, block.timestamp);
    }
    
    // ============ Layer 3: Multi-sig Release Functions ============
    
    // Approve release (2-of-3 multi-sig)
    function approveRelease(string memory _itemId) public {
        require(bytes(items[_itemId].id).length > 0, "Item not found");
        require(rewards[_itemId].amount > 0, "No reward to release");
        require(
            rewards[_itemId].state == EscrowState.AwaitingConfirmation ||
            rewards[_itemId].state == EscrowState.ItemDelivered,
            "Invalid escrow state"
        );
        
        bool isOwner = items[_itemId].reporterAddress == msg.sender;
        bool isFinder = rewards[_itemId].approvedFinder == msg.sender;
        bool isAdmin = msg.sender == admin;
        
        require(isOwner || isFinder || isAdmin, "Not authorized to approve");
        
        uint256 approvalCount = 0;
        
        if (isOwner && !rewards[_itemId].ownerApproved) {
            rewards[_itemId].ownerApproved = true;
            approvalCount++;
            emit ReleaseApproved(_itemId, msg.sender, approvalCount);
        }
        
        if (isFinder && !rewards[_itemId].finderApproved) {
            rewards[_itemId].finderApproved = true;
            approvalCount++;
            emit ReleaseApproved(_itemId, msg.sender, approvalCount);
        }
        
        if (isAdmin && !rewards[_itemId].adminApproved) {
            rewards[_itemId].adminApproved = true;
            approvalCount++;
            emit ReleaseApproved(_itemId, msg.sender, approvalCount);
        }
        
        require(approvalCount > 0, "Already approved or not authorized");
        
        // Check if we have 2 approvals and owner has confirmed item received
        uint256 totalApprovals = (rewards[_itemId].ownerApproved ? 1 : 0) + 
                                 (rewards[_itemId].finderApproved ? 1 : 0) + 
                                 (rewards[_itemId].adminApproved ? 1 : 0);
        
        // Auto-release if 2-of-3 approvals reached and owner confirmed receipt
        if (totalApprovals >= 2 && rewards[_itemId].ownerConfirmed) {
            _executeRelease(_itemId);
        }
    }
    
    // Internal function to execute release
    function _executeRelease(string memory _itemId) internal {
        RewardEscrow storage escrow = rewards[_itemId];
        require(escrow.state != EscrowState.Released && escrow.state != EscrowState.Refunded, "Already finalized");
        
        address payable finder = payable(escrow.approvedFinder);
        uint256 amount = escrow.amount;
        
        escrow.state = EscrowState.Released;
        items[_itemId].isClaimed = true;
        
        // Increase reputation of finder
        reputation[finder] += 10; // Reward for successful return
        
        finder.transfer(amount);
        
        emit RewardReleased(_itemId, finder, amount, block.timestamp);
    }
    
    // Trigger auto-release after time-lock expires
    function triggerAutoRelease(string memory _itemId) public {
        require(bytes(items[_itemId].id).length > 0, "Item not found");
        require(rewards[_itemId].state == EscrowState.AwaitingConfirmation, "Invalid escrow state");
        require(rewards[_itemId].ownerConfirmed, "Owner must confirm receipt first");
        require(block.timestamp >= rewards[_itemId].autoReleaseTime, "Auto-release time not reached");
        require(!rewards[_itemId].autoReleaseTriggered, "Auto-release already triggered");
        
        rewards[_itemId].autoReleaseTriggered = true;
        
        _executeRelease(_itemId);
        
        emit AutoReleaseTriggered(_itemId, block.timestamp);
    }
    
    // ============ Layer 3: Dispute Resolution ============
    
    // Raise dispute
    function raiseDispute(string memory _itemId, string memory _reason) public {
        require(bytes(items[_itemId].id).length > 0, "Item not found");
        require(rewards[_itemId].amount > 0, "No reward in escrow");
        require(
            rewards[_itemId].state == EscrowState.AwaitingDelivery ||
            rewards[_itemId].state == EscrowState.ItemDelivered ||
            rewards[_itemId].state == EscrowState.AwaitingConfirmation,
            "Cannot dispute at this stage"
        );
        
        bool isOwner = items[_itemId].reporterAddress == msg.sender;
        bool isFinder = rewards[_itemId].approvedFinder == msg.sender;
        
        require(isOwner || isFinder, "Only owner or finder can raise dispute");
        
        rewards[_itemId].state = EscrowState.Disputed;
        rewards[_itemId].disputeReason = _reason;
        rewards[_itemId].disputeRaisedBy = msg.sender;
        rewards[_itemId].disputeTimestamp = block.timestamp;
        
        emit DisputeRaised(_itemId, msg.sender, _reason, block.timestamp);
    }
    
    // Admin resolves dispute with release to finder
    function resolveDisputeRelease(string memory _itemId) public onlyAdmin {
        require(bytes(items[_itemId].id).length > 0, "Item not found");
        require(rewards[_itemId].state == EscrowState.Disputed, "No active dispute");
        
        rewards[_itemId].adminApproved = true;
        if (!rewards[_itemId].ownerConfirmed) {
            rewards[_itemId].ownerConfirmed = true; // Admin override
        }
        
        _executeRelease(_itemId);
        
        emit DisputeResolved(_itemId, "release_to_finder", block.timestamp);
    }
    
    // Admin resolves dispute with refund to owner
    function resolveDisputeRefund(string memory _itemId) public onlyAdmin {
        require(bytes(items[_itemId].id).length > 0, "Item not found");
        require(rewards[_itemId].state == EscrowState.Disputed, "No active dispute");
        
        RewardEscrow storage escrow = rewards[_itemId];
        require(escrow.state != EscrowState.Released && escrow.state != EscrowState.Refunded, "Already finalized");
        
        address payable owner = payable(escrow.depositor);
        uint256 amount = escrow.amount;
        
        escrow.state = EscrowState.Refunded;
        
        owner.transfer(amount);
        
        emit RewardRefunded(_itemId, owner, amount, block.timestamp);
        emit DisputeResolved(_itemId, "refund_to_owner", block.timestamp);
    }
    
    // Verify match and automatically pay reward (for backward compatibility)
    function verifyAndPay(string memory _itemId, address payable _finder, string memory _secret) public {
        require(items[_itemId].reporterAddress == msg.sender, "Only item owner can verify");
        require(rewards[_itemId].amount > 0, "No reward to pay");
        require(rewards[_itemId].state != EscrowState.Released && rewards[_itemId].state != EscrowState.Refunded, "Already finalized");
        
        // ZKP-lite Verification:
        // Ensure the secret provided by the finder (passed by owner) matches the hash on-chain
        if (items[_itemId].secretHash != bytes32(0)) {
            require(keccak256(abi.encodePacked(_secret)) == items[_itemId].secretHash, "Invalid secret proof");
        }

        rewards[_itemId].approvedFinder = _finder;
        rewards[_itemId].ownerApproved = true;
        rewards[_itemId].ownerConfirmed = true;
        
        // Ensure reputation is updated even for legacy calls
        _executeRelease(_itemId);
    }

    // Get item by QR code hash
    function getItemByQR(string memory _qrCodeHash) public view returns (
        string memory id,
        string memory itemType,
        address reporter,
        int256 latitude,
        int256 longitude,
        uint256 rewardAmount,
        bool isClaimed,
        string memory description,
        string memory metadataURI
    ) {
        string memory itemId = qrCodeToItemId[_qrCodeHash];
        require(bytes(itemId).length > 0, "QR code not found");
        
        Item memory item = items[itemId];
        return (
            item.id,
            item.itemType,
            item.reporterAddress,
            item.latitude,
            item.longitude,
            item.rewardAmount,
            item.isClaimed,
            item.description,
            item.metadataURI
        );
    }

    // Get all item IDs (for map display)
    function getAllItemIds() public view returns (string[] memory) {
        return itemIds;
    }

    // Get item details by ID
    function getItem(string memory _itemId) public view returns (
        string memory id,
        string memory itemType,
        address reporter,
        string memory qrCodeHash,
        int256 latitude,
        int256 longitude,
        uint256 rewardAmount,
        bool isClaimed,
        uint256 timestamp,
        string memory description,
        string memory metadataURI
    ) {
        Item memory item = items[_itemId];
        require(bytes(item.id).length > 0, "Item not found");
        
        return (
            item.id,
            item.itemType,
            item.reporterAddress,
            item.qrCodeHash,
            item.latitude,
            item.longitude,
            item.rewardAmount,
            item.isClaimed,
            item.timestamp,
            item.description,
            item.metadataURI
        );
    }

    // Store a match result (existing functionality preserved)
    function recordMatch(string memory _lostItemId, string memory _foundItemId, uint256 _matchScore) public {
        matches.push(MatchRecord({
            lostItemId: _lostItemId,
            foundItemId: _foundItemId,
            matchScore: _matchScore,
            timestamp: block.timestamp
        }));

        emit MatchRecorded(_lostItemId, _foundItemId, _matchScore, block.timestamp);
    }

    function getMatchCount() public view returns (uint256) {
        return matches.length;
    }

    function getMatch(uint256 index) public view returns (string memory, string memory, uint256, uint256) {
        require(index < matches.length, "Index out of bounds");
        MatchRecord memory m = matches[index];
        return (m.lostItemId, m.foundItemId, m.matchScore, m.timestamp);
    }

    // Get total number of items
    function getItemCount() public view returns (uint256) {
        return itemIds.length;
    }

    // ============ View Functions ============
    
    // Get reward info
    function getRewardInfo(string memory _itemId) public view returns (
        uint256 amount,
        address depositor,
        bool isReleased,
        bool isRefunded
    ) {
        RewardEscrow memory reward = rewards[_itemId];
        return (
            reward.amount, 
            reward.depositor, 
            reward.state == EscrowState.Released,
            reward.state == EscrowState.Refunded
        );
    }
    
    // Get full escrow details
    function getEscrowDetails(string memory _itemId) public view returns (
        uint256 amount,
        address depositor,
        address approvedFinder,
        EscrowState state,
        bool ownerConfirmed,
        bool finderConfirmed,
        bool ownerApproved,
        bool finderApproved,
        bool adminApproved,
        uint256 autoReleaseTime,
        bool autoReleaseTriggered
    ) {
        RewardEscrow memory escrow = rewards[_itemId];
        return (
            escrow.amount,
            escrow.depositor,
            escrow.approvedFinder,
            escrow.state,
            escrow.ownerConfirmed,
            escrow.finderConfirmed,
            escrow.ownerApproved,
            escrow.finderApproved,
            escrow.adminApproved,
            escrow.autoReleaseTime,
            escrow.autoReleaseTriggered
        );
    }
    
    // Get dispute info
    function getDisputeInfo(string memory _itemId) public view returns (
        bool isDisputed,
        string memory reason,
        address raisedBy,
        uint256 timestamp
    ) {
        RewardEscrow memory escrow = rewards[_itemId];
        return (
            escrow.state == EscrowState.Disputed,
            escrow.disputeReason,
            escrow.disputeRaisedBy,
            escrow.disputeTimestamp
        );
    }
    
    // Check if auto-release is available
    function canAutoRelease(string memory _itemId) public view returns (bool) {
        RewardEscrow memory escrow = rewards[_itemId];
        return (
            escrow.state == EscrowState.AwaitingConfirmation &&
            escrow.ownerConfirmed &&
            !escrow.autoReleaseTriggered &&
            block.timestamp >= escrow.autoReleaseTime
        );
    }
}
