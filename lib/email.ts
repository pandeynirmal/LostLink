import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export interface EmailUser {
  email: string;
  fullName: string;
}

export interface EscrowEmailData {
  itemId: string;
  itemDescription?: string;
  amountEth: number;
  state: string;
  owner?: EmailUser;
  finder?: EmailUser;
  disputeReason?: string;
  txHash?: string;
}

// Layer 1: Funding Notifications
export async function sendEscrowCreatedEmail(
  to: EmailUser,
  data: EscrowEmailData
) {
  const subject = `Escrow Created - ${data.amountEth} ETH`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #10b981;">🔒 Escrow Created</h2>
      <p>Hello ${to.fullName},</p>
      <p>An escrow has been created for your item.</p>
      <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p><strong>Amount:</strong> ${data.amountEth} ETH</p>
        <p><strong>Status:</strong> Funded</p>
        <p><strong>Item ID:</strong> ${data.itemId}</p>
      </div>
      <p>The funds are now locked in the escrow. A finder can be assigned to proceed.</p>
      <p style="color: #6b7280; font-size: 12px;">This is an automated message from LostLink.</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"LostLink Escrow" <${process.env.EMAIL_USER}>`,
    to: to.email,
    subject,
    html,
  });
}

export async function sendFinderAssignedEmail(
  to: EmailUser,
  data: EscrowEmailData
) {
  const subject = `Finder Assigned to Your Escrow`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #3b82f6;">👤 Finder Assigned</h2>
      <p>Hello ${to.fullName},</p>
      <p>A finder has been assigned to your escrow.</p>
      <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p><strong>Finder:</strong> ${data.finder?.fullName || "Unknown"}</p>
        <p><strong>Amount:</strong> ${data.amountEth} ETH</p>
        <p><strong>Status:</strong> Finder Assigned</p>
      </div>
      <p>The finder will now initiate the delivery process.</p>
      <p style="color: #6b7280; font-size: 12px;">This is an automated message from LostLink.</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"LostLink Escrow" <${process.env.EMAIL_USER}>`,
    to: to.email,
    subject,
    html,
  });
}

// Layer 2: Delivery Notifications
export async function sendDeliveryInitiatedEmail(
  to: EmailUser,
  data: EscrowEmailData
) {
  const subject = `Delivery Initiated for Your Item`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #f59e0b;">🚚 Delivery Initiated</h2>
      <p>Hello ${to.fullName},</p>
      <p>The finder has initiated delivery of your item.</p>
      <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p><strong>Amount:</strong> ${data.amountEth} ETH</p>
        <p><strong>Status:</strong> Awaiting Delivery</p>
        <p><strong>Finder:</strong> ${data.finder?.fullName || "Unknown"}</p>
      </div>
      <p>You will be notified when the item is marked as delivered.</p>
      <p style="color: #6b7280; font-size: 12px;">This is an automated message from LostLink.</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"LostLink Escrow" <${process.env.EMAIL_USER}>`,
    to: to.email,
    subject,
    html,
  });
}

export async function sendItemDeliveredEmail(
  to: EmailUser,
  data: EscrowEmailData
) {
  const subject = `Item Marked as Delivered - Action Required`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #06b6d4;">📦 Item Delivered</h2>
      <p>Hello ${to.fullName},</p>
      <p>The finder has marked the item as delivered.</p>
      <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p><strong>Amount:</strong> ${data.amountEth} ETH</p>
        <p><strong>Status:</strong> Item Delivered</p>
        <p><strong>Finder:</strong> ${data.finder?.fullName || "Unknown"}</p>
      </div>
      <p><strong>Action Required:</strong> Please confirm that you have received the item to proceed with the escrow release.</p>
      <p>If you don't confirm within 7 days, the escrow will auto-release to the finder.</p>
      <p style="color: #6b7280; font-size: 12px;">This is an automated message from LostLink.</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"LostLink Escrow" <${process.env.EMAIL_USER}>`,
    to: to.email,
    subject,
    html,
  });
}

export async function sendItemReceivedConfirmationEmail(
  to: EmailUser,
  data: EscrowEmailData
) {
  const subject = `Item Receipt Confirmed`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #10b981;">✅ Item Receipt Confirmed</h2>
      <p>Hello ${to.fullName},</p>
      <p>The owner has confirmed receipt of the item.</p>
      <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p><strong>Amount:</strong> ${data.amountEth} ETH</p>
        <p><strong>Status:</strong> Awaiting Confirmation</p>
        <p><strong>Owner:</strong> ${data.owner?.fullName || "Unknown"}</p>
      </div>
      <p>The escrow is now waiting for release approvals. 2 out of 3 parties (owner, finder, admin) must approve the release.</p>
      <p>If no disputes are raised, the funds will auto-release in 7 days.</p>
      <p style="color: #6b7280; font-size: 12px;">This is an automated message from LostLink.</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"LostLink Escrow" <${process.env.EMAIL_USER}>`,
    to: to.email,
    subject,
    html,
  });
}

// Layer 3: Release Notifications
export async function sendReleaseApprovedEmail(
  to: EmailUser,
  data: EscrowEmailData & { approvalCount: number }
) {
  const subject = `Escrow Release Approved (${data.approvalCount}/3)`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #8b5cf6;">📝 Release Approval Update</h2>
      <p>Hello ${to.fullName},</p>
      <p>A party has approved the escrow release.</p>
      <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p><strong>Amount:</strong> ${data.amountEth} ETH</p>
        <p><strong>Approvals:</strong> ${data.approvalCount}/3</p>
        <p><strong>Status:</strong> Awaiting Confirmation</p>
      </div>
      <p>2 out of 3 approvals are required for automatic release.</p>
      <p style="color: #6b7280; font-size: 12px;">This is an automated message from LostLink.</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"LostLink Escrow" <${process.env.EMAIL_USER}>`,
    to: to.email,
    subject,
    html,
  });
}

export async function sendEscrowReleasedEmail(
  to: EmailUser,
  data: EscrowEmailData
) {
  const subject = `🎉 Escrow Released - ${data.amountEth} ETH`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #22c55e;">🎉 Escrow Released!</h2>
      <p>Hello ${to.fullName},</p>
      <p>The escrow has been released successfully.</p>
      <div style="background: #dcfce7; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #86efac;">
        <p><strong>Amount:</strong> ${data.amountEth} ETH</p>
        <p><strong>Status:</strong> Released</p>
        ${data.txHash ? `<p><strong>Transaction:</strong> ${data.txHash.slice(0, 20)}...</p>` : ""}
      </div>
      <p>The funds have been transferred to the finder.</p>
      <p>Thank you for using LostLink!</p>
      <p style="color: #6b7280; font-size: 12px;">This is an automated message from LostLink.</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"LostLink Escrow" <${process.env.EMAIL_USER}>`,
    to: to.email,
    subject,
    html,
  });
}

export async function sendEscrowRefundedEmail(
  to: EmailUser,
  data: EscrowEmailData
) {
  const subject = `Escrow Refunded - ${data.amountEth} ETH`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #6b7280;">↩️ Escrow Refunded</h2>
      <p>Hello ${to.fullName},</p>
      <p>The escrow has been refunded.</p>
      <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p><strong>Amount:</strong> ${data.amountEth} ETH</p>
        <p><strong>Status:</strong> Refunded</p>
        ${data.txHash ? `<p><strong>Transaction:</strong> ${data.txHash.slice(0, 20)}...</p>` : ""}
      </div>
      <p>The funds have been returned to the owner.</p>
      <p style="color: #6b7280; font-size: 12px;">This is an automated message from LostLink.</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"LostLink Escrow" <${process.env.EMAIL_USER}>`,
    to: to.email,
    subject,
    html,
  });
}

// Dispute Notifications
export async function sendDisputeRaisedEmail(
  to: EmailUser,
  data: EscrowEmailData
) {
  const subject = `⚠️ Dispute Raised - Action Required`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #ef4444;">⚠️ Dispute Raised</h2>
      <p>Hello ${to.fullName},</p>
      <p>A dispute has been raised for this escrow.</p>
      <div style="background: #fef2f2; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #fecaca;">
        <p><strong>Amount:</strong> ${data.amountEth} ETH</p>
        <p><strong>Status:</strong> Disputed</p>
        ${data.disputeReason ? `<p><strong>Reason:</strong> ${data.disputeReason}</p>` : ""}
      </div>
      <p>An admin will review the dispute and make a resolution.</p>
      <p>Please check your dashboard for updates.</p>
      <p style="color: #6b7280; font-size: 12px;">This is an automated message from LostLink.</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"LostLink Escrow" <${process.env.EMAIL_USER}>`,
    to: to.email,
    subject,
    html,
  });
}

export async function sendDisputeResolvedEmail(
  to: EmailUser,
  data: EscrowEmailData & { resolution: string }
) {
  const subject = `Dispute Resolved - ${data.resolution === "release_to_finder" ? "Released" : "Refunded"}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #22c55e;">✅ Dispute Resolved</h2>
      <p>Hello ${to.fullName},</p>
      <p>The dispute has been resolved by an admin.</p>
      <div style="background: #dcfce7; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #86efac;">
        <p><strong>Amount:</strong> ${data.amountEth} ETH</p>
        <p><strong>Resolution:</strong> ${data.resolution === "release_to_finder" ? "Released to Finder" : "Refunded to Owner"}</p>
        ${data.txHash ? `<p><strong>Transaction:</strong> ${data.txHash.slice(0, 20)}...</p>` : ""}
      </div>
      <p>The escrow has been finalized according to the admin's decision.</p>
      <p style="color: #6b7280; font-size: 12px;">This is an automated message from LostLink.</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"LostLink Escrow" <${process.env.EMAIL_USER}>`,
    to: to.email,
    subject,
    html,
  });
}

// Admin notification for disputes
export async function sendAdminDisputeNotification(
  adminEmail: string,
  data: EscrowEmailData
) {
  const subject = `🚨 New Dispute Requires Resolution`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #ef4444;">🚨 New Dispute</h2>
      <p>A dispute has been raised and requires admin resolution.</p>
      <div style="background: #fef2f2; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #fecaca;">
        <p><strong>Item ID:</strong> ${data.itemId}</p>
        <p><strong>Amount:</strong> ${data.amountEth} ETH</p>
        <p><strong>Owner:</strong> ${data.owner?.fullName} (${data.owner?.email})</p>
        <p><strong>Finder:</strong> ${data.finder?.fullName} (${data.finder?.email})</p>
        ${data.disputeReason ? `<p><strong>Reason:</strong> ${data.disputeReason}</p>` : ""}
      </div>
      <p>Please review and resolve this dispute in the admin dashboard.</p>
      <p style="color: #6b7280; font-size: 12px;">This is an automated message from LostLink.</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"LostLink Escrow" <${process.env.EMAIL_USER}>`,
    to: adminEmail,
    subject,
    html,
  });
}

// Auto-release warning
export async function sendAutoReleaseWarningEmail(
  to: EmailUser,
  data: EscrowEmailData & { hoursRemaining: number }
) {
  const subject = `⏰ Auto-Release in ${data.hoursRemaining} Hours`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #f59e0b;">⏰ Auto-Release Warning</h2>
      <p>Hello ${to.fullName},</p>
      <p>The escrow will auto-release in ${data.hoursRemaining} hours.</p>
      <div style="background: #fffbeb; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #fcd34d;">
        <p><strong>Amount:</strong> ${data.amountEth} ETH</p>
        <p><strong>Status:</strong> Awaiting Confirmation</p>
        <p><strong>Auto-release in:</strong> ${data.hoursRemaining} hours</p>
      </div>
      <p>If you have any issues, please raise a dispute before the auto-release occurs.</p>
      <p style="color: #6b7280; font-size: 12px;">This is an automated message from LostLink.</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"LostLink Escrow" <${process.env.EMAIL_USER}>`,
    to: to.email,
    subject,
    html,
  });
}
