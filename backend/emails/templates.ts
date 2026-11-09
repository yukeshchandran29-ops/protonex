/**
 * ProtoNex transactional email templates.
 * Each template returns a subject + HTML body. Never include internal engineer
 * notes here — only customer-facing fields are allowed to reach this file.
 */

const shell = (title: string, bodyHtml: string) => `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0b0d10;font-family:Segoe UI,Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0d10;padding:32px 0;">
      <tr><td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#14171c;border-radius:12px;overflow:hidden;border:1px solid #23262b;">
          <tr><td style="padding:28px 32px;border-bottom:1px solid #23262b;">
            <span style="color:#ff7a1a;font-weight:700;font-size:20px;letter-spacing:0.5px;">PROTO NEX</span>
            <div style="color:#8a8f98;font-size:12px;margin-top:4px;">Where Ideas Become Prototypes.</div>
          </td></tr>
          <tr><td style="padding:32px;color:#e6e8eb;font-size:15px;line-height:1.6;">
            <h2 style="color:#fff;margin:0 0 16px;font-size:18px;">${title}</h2>
            ${bodyHtml}
          </td></tr>
          <tr><td style="padding:20px 32px;border-top:1px solid #23262b;color:#5c6169;font-size:12px;">
            ProtoNex Manufacturing · support@protonex.example<br/>
            You're receiving this because you have an account or an active quote with ProtoNex.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

const ctaButton = (label: string, url: string) =>
  `<a href="${url}" style="display:inline-block;margin-top:20px;padding:12px 24px;background:#ff7a1a;color:#0b0d10;font-weight:600;text-decoration:none;border-radius:8px;">${label}</a>`;

export type EmailTemplateName =
  | 'welcome'
  | 'email_verification'
  | 'password_reset'
  | 'quote_submitted'
  | 'quote_under_review'
  | 'quote_needs_info'
  | 'quote_approved'
  | 'quote_rejected'
  | 'quote_expiring_soon'
  | 'order_confirmation'
  | 'production_started'
  | 'production_completed'
  | 'order_shipped'
  | 'order_delivered';

export const emailTemplates: Record<EmailTemplateName, (data: any) => { subject: string; html: string }> = {
  welcome: (d) => ({
    subject: 'Welcome to ProtoNex',
    html: shell('Welcome to ProtoNex', `<p>Hi ${d.name},</p><p>Your account is ready. Upload a CAD file to get a geometry-aware instant estimate.</p>${ctaButton('Go to dashboard', `${d.appUrl || ''}/dashboard.html`)}`),
  }),
  email_verification: (d) => ({
    subject: 'Verify your ProtoNex email',
    html: shell('Confirm your email address', `<p>Hi ${d.name},</p><p>Please confirm your email to activate your account.</p>${ctaButton('Verify email', d.verifyUrl)}<p style="margin-top:20px;color:#8a8f98;font-size:13px;">This link expires in 24 hours.</p>`),
  }),
  password_reset: (d) => ({
    subject: 'Reset your ProtoNex password',
    html: shell('Reset your password', `<p>Hi ${d.name},</p><p>We received a request to reset your password.</p>${ctaButton('Reset password', d.resetUrl)}<p style="margin-top:20px;color:#8a8f98;font-size:13px;">This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`),
  }),
  quote_submitted: (d) => ({
    subject: `ProtoNex Quote Request Received — ${d.quoteNumber}`,
    html: shell('Quote request received', `<p>Hi ${d.name},</p><p>We've received your request for quote <b>${d.quoteNumber}</b>. Our engineering team is reviewing your CAD geometry now.</p>`),
  }),
  quote_under_review: (d) => ({
    subject: `Your ProtoNex Quote ${d.quoteNumber} is under review`,
    html: shell('Quote under review', `<p>Hi ${d.name},</p><p>An engineer has started reviewing quote <b>${d.quoteNumber}</b>.</p>`),
  }),
  quote_needs_info: (d) => ({
    subject: `Action needed on ProtoNex Quote ${d.quoteNumber}`,
    html: shell('We need a bit more information', `<p>Hi ${d.name},</p><p>${d.customerNotes || 'Our engineering team needs additional details before finalizing your quote.'}</p>${ctaButton('View quote', d.quoteUrl)}`),
  }),
  quote_approved: (d) => ({
    subject: `Your ProtoNex Quote ${d.quoteNumber} is Ready`,
    html: shell('Your quote is ready', `<p>Hi ${d.name},</p><p>Quote <b>${d.quoteNumber}</b> has been finalized at <b>$${d.finalPrice}</b> with a lead time of ${d.leadTime} days.</p>${ctaButton('Review & accept', d.quoteUrl)}`),
  }),
  quote_rejected: (d) => ({
    subject: `Update on your ProtoNex Quote ${d.quoteNumber}`,
    html: shell('Quote update', `<p>Hi ${d.name},</p><p>Unfortunately we're unable to move forward with quote <b>${d.quoteNumber}</b> as specified.</p>${d.customerNotes ? `<p>${d.customerNotes}</p>` : ''}`),
  }),
  quote_expiring_soon: (d) => ({
    subject: `ProtoNex Quote ${d.quoteNumber} expires soon`,
    html: shell('Your quote is expiring soon', `<p>Hi ${d.name},</p><p>Quote <b>${d.quoteNumber}</b> will expire on ${d.expiresAt}. Accept it now to lock in your price.</p>${ctaButton('View quote', d.quoteUrl)}`),
  }),
  order_confirmation: (d) => ({
    subject: `ProtoNex Order Confirmed — ${d.orderNumber}`,
    html: shell('Order confirmed', `<p>Hi ${d.name},</p><p>Your order <b>${d.orderNumber}</b> has been created from quote ${d.quoteNumber}. We'll notify you as production progresses.</p>`),
  }),
  production_started: (d) => ({
    subject: `Production started — ${d.orderNumber}`,
    html: shell('Production has started', `<p>Hi ${d.name},</p><p>Your order <b>${d.orderNumber}</b> has entered production.</p>`),
  }),
  production_completed: (d) => ({
    subject: `Production complete — ${d.orderNumber}`,
    html: shell('Production complete', `<p>Hi ${d.name},</p><p>Your order <b>${d.orderNumber}</b> has finished production and is undergoing quality checks.</p>`),
  }),
  order_shipped: (d) => ({
    subject: `Your order has shipped — ${d.orderNumber}`,
    html: shell('Your order has shipped', `<p>Hi ${d.name},</p><p>Order <b>${d.orderNumber}</b> is on its way${d.trackingNumber ? ` (tracking: ${d.trackingNumber})` : ''}.</p>`),
  }),
  order_delivered: (d) => ({
    subject: `Delivered — ${d.orderNumber}`,
    html: shell('Your order was delivered', `<p>Hi ${d.name},</p><p>Order <b>${d.orderNumber}</b> has been marked as delivered. Thanks for building with ProtoNex.</p>`),
  }),
};
