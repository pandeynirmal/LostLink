// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract LostAndFound {
    
    struct MatchRecord {
        string lostItemId;
        string foundItemId;
        uint256 matchScore; // Scaled by 100 (e.g. 95 = 0.95)
        uint256 timestamp;
    }

    MatchRecord[] public matches;
    
    event MatchRecorded(string lostItemId, string foundItemId, uint256 matchScore, uint256 timestamp);

    // Store a match result
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
}
