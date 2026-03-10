import {
  sendEscrowCreatedEmail,
  sendFinderAssignedEmail,
  sendDeliveryInitiatedEmail,
  sendItemDeliveredEmail,
  sendItemReceivedConfirmationEmail,
  sendReleaseApprovedEmail,
  sendEscrowReleasedEmail,
  sendEscrowRefundedEmail,
  sendDisputeRaisedEmail,
  sendDisputeResolvedEmail,
  sendAdminDisputeNotification,
  EmailUser,
  EscrowEmailData,
} from "./email";
import User from "./models/User";
import Item from "./models/Item";

interface EscrowNotificationContext {
  escrow: any;
  item?: any;
  owner?: any;
  finder?: any;
}

async function getUsersForEscrow(escrow: any): Promise<{
  owner: EmailUser | null;
  finder: EmailUser | null;
}> {
  try {
    const [ownerDoc, finderDoc] = await Promise.all([
      User.findById(escrow.ownerId).select("fullName email").lean(),
      escrow.finderId ? User.findById(escrow.finderId).select("fullName email").lean() : null,
    ]);

    const ownerData = ownerDoc as any;
    const finderData = finderDoc as any;
    return {
      owner: ownerData ? { email: ownerData.email, fullName: ownerData.fullName } : null,
      finder: finderData ? { email: finderData.email, fullName: finderData.fullName } : null,
    };
  } catch {
    return { owner: null, finder: null };
  }
}

async function getItemDescription(itemId: string): Promise<string | undefined> {
  try {
    const item = await Item.findById(itemId).select("description").lean();
    return item?.description;
  } catch {
    return undefined;
  }
}

export async function notifyEscrowCreated(escrow: any) {
  const { owner } = await getUsersForEscrow(escrow);
  if (!owner) return;

  const data: EscrowEmailData = {
    itemId: escrow.itemId.toString(),
    amountEth: escrow.amountEth,
    state: escrow.state,
  };

  await sendEscrowCreatedEmail(owner, data);
}

export async function notifyFinderAssigned(escrow: any) {
  const { owner, finder } = await getUsersForEscrow(escrow);
  if (!owner || !finder) return;

  const itemDescription = await getItemDescription(escrow.itemId);
  const data: EscrowEmailData = {
    itemId: escrow.itemId.toString(),
    itemDescription,
    amountEth: escrow.amountEth,
    state: escrow.state,
    owner,
    finder,
  };

  // Notify both parties
  await Promise.all([
    sendFinderAssignedEmail(owner, data),
    sendFinderAssignedEmail(finder, { ...data, finder: owner }),
  ]);
}

export async function notifyDeliveryInitiated(escrow: any) {
  const { owner, finder } = await getUsersForEscrow(escrow);
  if (!owner || !finder) return;

  const itemDescription = await getItemDescription(escrow.itemId);
  const data: EscrowEmailData = {
    itemId: escrow.itemId.toString(),
    itemDescription,
    amountEth: escrow.amountEth,
    state: escrow.state,
    owner,
    finder,
  };

  // Notify owner that delivery has started
  await sendDeliveryInitiatedEmail(owner, data);
}

export async function notifyItemDelivered(escrow: any) {
  const { owner, finder } = await getUsersForEscrow(escrow);
  if (!owner || !finder) return;

  const itemDescription = await getItemDescription(escrow.itemId);
  const data: EscrowEmailData = {
    itemId: escrow.itemId.toString(),
    itemDescription,
    amountEth: escrow.amountEth,
    state: escrow.state,
    owner,
    finder,
  };

  // Notify owner that action is required
  await sendItemDeliveredEmail(owner, data);
  
  // Notify finder that item is marked delivered
  await sendItemDeliveredEmail(finder, { ...data, finder: owner });
}

export async function notifyItemReceived(escrow: any) {
  const { owner, finder } = await getUsersForEscrow(escrow);
  if (!owner || !finder) return;

  const itemDescription = await getItemDescription(escrow.itemId);
  const data: EscrowEmailData = {
    itemId: escrow.itemId.toString(),
    itemDescription,
    amountEth: escrow.amountEth,
    state: escrow.state,
    owner,
    finder,
  };

  // Notify finder that owner confirmed receipt
  await sendItemReceivedConfirmationEmail(finder, data);
}

export async function notifyReleaseApproved(escrow: any, approvalCount: number) {
  const { owner, finder } = await getUsersForEscrow(escrow);
  if (!owner || !finder) return;

  const itemDescription = await getItemDescription(escrow.itemId);
  const data: EscrowEmailData & { approvalCount: number } = {
    itemId: escrow.itemId.toString(),
    itemDescription,
    amountEth: escrow.amountEth,
    state: escrow.state,
    owner,
    finder,
    approvalCount,
  };

  // Notify both parties
  await Promise.all([
    sendReleaseApprovedEmail(owner, data),
    sendReleaseApprovedEmail(finder, data),
  ]);
}

export async function notifyEscrowReleased(escrow: any, txHash?: string) {
  const { owner, finder } = await getUsersForEscrow(escrow);
  if (!owner || !finder) return;

  const itemDescription = await getItemDescription(escrow.itemId);
  const data: EscrowEmailData = {
    itemId: escrow.itemId.toString(),
    itemDescription,
    amountEth: escrow.amountEth,
    state: "released",
    owner,
    finder,
    txHash,
  };

  // Notify both parties
  await Promise.all([
    sendEscrowReleasedEmail(owner, data),
    sendEscrowReleasedEmail(finder, { ...data, finder: owner }),
  ]);
}

export async function notifyEscrowRefunded(escrow: any, txHash?: string) {
  const { owner, finder } = await getUsersForEscrow(escrow);
  
  const itemDescription = await getItemDescription(escrow.itemId);
  const data: EscrowEmailData = {
    itemId: escrow.itemId.toString(),
    itemDescription,
    amountEth: escrow.amountEth,
    state: "refunded",
    owner: owner || undefined,
    finder: finder || undefined,
    txHash,
  };

  // Notify owner
  if (owner) {
    await sendEscrowRefundedEmail(owner, data);
  }
  
  // Notify finder if exists
  if (finder) {
    await sendEscrowRefundedEmail(finder, { ...data, finder: owner || undefined });
  }
}

export async function notifyDisputeRaised(escrow: any) {
  const { owner, finder } = await getUsersForEscrow(escrow);
  if (!owner || !finder) return;

  const itemDescription = await getItemDescription(escrow.itemId);
  const data: EscrowEmailData = {
    itemId: escrow.itemId.toString(),
    itemDescription,
    amountEth: escrow.amountEth,
    state: "disputed",
    owner,
    finder,
    disputeReason: escrow.disputeReason,
  };

  // Notify both parties
  await Promise.all([
    sendDisputeRaisedEmail(owner, data),
    sendDisputeRaisedEmail(finder, { ...data, finder: owner }),
  ]);

  // Notify admin
  const adminEmails = await User.find({ role: "admin" }).select("email").lean();
  await Promise.all(
    adminEmails.map((admin) =>
      sendAdminDisputeNotification(admin.email, data)
    )
  );
}

export async function notifyDisputeResolved(escrow: any, resolution: string, txHash?: string) {
  const { owner, finder } = await getUsersForEscrow(escrow);
  if (!owner || !finder) return;

  const itemDescription = await getItemDescription(escrow.itemId);
  const data: EscrowEmailData & { resolution: string } = {
    itemId: escrow.itemId.toString(),
    itemDescription,
    amountEth: escrow.amountEth,
    state: resolution === "release_to_finder" ? "released" : "refunded",
    owner,
    finder,
    resolution,
    txHash,
  };

  // Notify both parties
  await Promise.all([
    sendDisputeResolvedEmail(owner, data),
    sendDisputeResolvedEmail(finder, data),
  ]);
}
