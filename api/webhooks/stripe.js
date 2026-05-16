const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const { Resend } = require('resend')

const resend = new Resend(process.env.RESEND_API_KEY)

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end()

  const rawBody = await getRawBody(req)
  const sig = req.headers['stripe-signature']

  let event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    return res.status(400).json({ error: `Webhook error: ${err.message}` })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const {
      firstName, lastName, email, phone,
      eventDate, rentalItem, totalAmount, notes,
      studioDate, studioStart, studioEnd,
    } = session.metadata || {}

    const customerName = `${firstName} ${lastName}`
    const depositPaid = (session.amount_total / 100).toFixed(2)
    const total = totalAmount ? parseFloat(totalAmount).toFixed(2) : depositPaid
    const remaining = (parseFloat(total) - parseFloat(depositPaid)).toFixed(2)
    const bookingDate = eventDate || studioDate || 'TBD'
    const service = rentalItem || 'C4 Service'

    // Email to customer
    await resend.emails.send({
      from: 'C4 Services <support@c4service.co>',
      to: [email],
      subject: `Booking Confirmed — ${service}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;color:#222;">
          <div style="background:#c41e3a;padding:28px 32px;border-radius:12px 12px 0 0;">
            <h1 style="margin:0;color:#fff;font-size:24px;letter-spacing:.04em;">YOU'RE BOOKED.</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">C4 Services — Booking Confirmation</p>
          </div>
          <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:28px 32px;">
            <p style="font-size:15px;margin:0 0 20px;">Hey ${firstName}, your booking is confirmed. Here's everything you need:</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
              <tr style="background:#f9fafb;"><td style="padding:11px 14px;font-weight:700;width:140px;">Service</td><td style="padding:11px 14px;">${service}</td></tr>
              <tr><td style="padding:11px 14px;font-weight:700;">Date</td><td style="padding:11px 14px;">${bookingDate}</td></tr>
              ${phone ? `<tr style="background:#f9fafb;"><td style="padding:11px 14px;font-weight:700;">Phone</td><td style="padding:11px 14px;">${phone}</td></tr>` : ''}
              <tr ${phone ? '' : 'style="background:#f9fafb;"'}><td style="padding:11px 14px;font-weight:700;">Deposit Paid</td><td style="padding:11px 14px;color:#16a34a;font-weight:700;">$${depositPaid}</td></tr>
              <tr style="background:#f9fafb;"><td style="padding:11px 14px;font-weight:700;">Balance Due</td><td style="padding:11px 14px;">$${remaining} (due at service)</td></tr>
              ${notes ? `<tr><td style="padding:11px 14px;font-weight:700;vertical-align:top;">Notes</td><td style="padding:11px 14px;">${notes}</td></tr>` : ''}
            </table>
            <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin-bottom:24px;font-size:13px;color:#555;line-height:1.7;">
              Questions? Reply to this email or call us at <strong>(773) 584-7821</strong>. We'll see you on <strong>${bookingDate}</strong>.
            </div>
            <p style="font-size:13px;color:#999;margin:0;">— The C4 Services Team</p>
          </div>
        </div>
      `
    })

    // Email to management
    await resend.emails.send({
      from: 'C4 Services <support@c4service.co>',
      to: ['c4mgmtgroup@gmail.com'],
      subject: `New Booking: ${customerName} — ${service}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;color:#222;">
          <div style="background:#111;padding:20px 24px;border-radius:12px 12px 0 0;">
            <h2 style="margin:0;color:#fff;font-size:18px;">New Booking Received</h2>
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.5);font-size:12px;">C4 Services — Payment Confirmed</p>
          </div>
          <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:24px;">
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr style="background:#f9fafb;"><td style="padding:10px 14px;font-weight:700;width:140px;">Customer</td><td style="padding:10px 14px;">${customerName}</td></tr>
              <tr><td style="padding:10px 14px;font-weight:700;">Email</td><td style="padding:10px 14px;"><a href="mailto:${email}" style="color:#c41e3a;">${email}</a></td></tr>
              <tr style="background:#f9fafb;"><td style="padding:10px 14px;font-weight:700;">Phone</td><td style="padding:10px 14px;">${phone || 'Not provided'}</td></tr>
              <tr><td style="padding:10px 14px;font-weight:700;">Service</td><td style="padding:10px 14px;">${service}</td></tr>
              <tr style="background:#f9fafb;"><td style="padding:10px 14px;font-weight:700;">Date</td><td style="padding:10px 14px;">${bookingDate}</td></tr>
              <tr><td style="padding:10px 14px;font-weight:700;">Deposit Paid</td><td style="padding:10px 14px;color:#16a34a;font-weight:700;">$${depositPaid}</td></tr>
              <tr style="background:#f9fafb;"><td style="padding:10px 14px;font-weight:700;">Total</td><td style="padding:10px 14px;">$${total}</td></tr>
              <tr><td style="padding:10px 14px;font-weight:700;">Balance Due</td><td style="padding:10px 14px;">$${remaining}</td></tr>
              ${notes ? `<tr style="background:#f9fafb;"><td style="padding:10px 14px;font-weight:700;vertical-align:top;">Notes</td><td style="padding:10px 14px;">${notes}</td></tr>` : ''}
            </table>
          </div>
        </div>
      `
    })
  }

  res.status(200).json({ received: true })
}
