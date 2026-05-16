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

function isStudioBooking(rentalItem) {
  return rentalItem && rentalItem.toLowerCase().includes('recording studio')
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
    const remaining = Math.max(0, parseFloat(total) - parseFloat(depositPaid)).toFixed(2)
    const bookingDate = eventDate || studioDate || 'TBD'
    const service = rentalItem || 'C4 Service'
    const studio = isStudioBooking(rentalItem)

    // ── Customer confirmation ──────────────────────────────────────────────
    const customerSubject = studio
      ? `Session Confirmed — ${studioStart} to ${studioEnd} on ${bookingDate}`
      : `Booking Confirmed — ${service}`

    const studioDetails = studio ? `
      <tr style="background:#f9fafb;">
        <td style="padding:11px 16px;font-weight:700;color:#111;width:160px;">Time Slot</td>
        <td style="padding:11px 16px;">${studioStart} – ${studioEnd}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;font-weight:700;color:#111;">Engineer</td>
        <td style="padding:11px 16px;">${rentalItem.match(/with (.+)$/)?.[1] || 'TBD'}</td>
      </tr>
    ` : ''

    await resend.emails.send({
      from: 'C4 Services <support@c4service.co>',
      to: [email],
      subject: customerSubject,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
            <tr><td align="center">
              <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">

                <!-- Header -->
                <tr>
                  <td style="background:#c41e3a;border-radius:12px 12px 0 0;padding:32px 36px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td>
                          <div style="font-size:28px;font-weight:900;color:#fff;letter-spacing:.06em;font-family:Arial Black,Arial,sans-serif;">C4 SERVICES</div>
                          <div style="font-size:13px;color:rgba(255,255,255,0.7);margin-top:4px;letter-spacing:.08em;text-transform:uppercase;">Booking Confirmation</div>
                        </td>
                        <td align="right">
                          <div style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);border-radius:100px;padding:6px 16px;font-size:12px;font-weight:700;color:#fff;letter-spacing:.06em;text-transform:uppercase;">&#10003; Confirmed</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Body -->
                <tr>
                  <td style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:32px 36px;">
                    <p style="font-size:16px;color:#111;margin:0 0 6px;font-weight:700;">Hey ${firstName},</p>
                    <p style="font-size:14px;color:#555;margin:0 0 28px;line-height:1.7;">
                      ${studio
                        ? `Your studio session is locked in. Show up ready and we'll handle the rest.`
                        : `Your booking is confirmed. We'll be there ready to go on ${bookingDate}.`
                      }
                    </p>

                    <!-- Booking Details -->
                    <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#c41e3a;margin-bottom:12px;">Booking Details</div>
                    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;font-size:14px;margin-bottom:28px;">
                      <tr style="background:#f9fafb;">
                        <td style="padding:11px 16px;font-weight:700;color:#111;width:160px;">Service</td>
                        <td style="padding:11px 16px;color:#333;">${studio ? 'Recording Studio' : service}</td>
                      </tr>
                      <tr>
                        <td style="padding:11px 16px;font-weight:700;color:#111;">Date</td>
                        <td style="padding:11px 16px;color:#333;">${bookingDate}</td>
                      </tr>
                      ${studioDetails}
                      <tr style="background:#f9fafb;">
                        <td style="padding:11px 16px;font-weight:700;color:#111;">Deposit Paid</td>
                        <td style="padding:11px 16px;color:#16a34a;font-weight:700;">$${depositPaid} ✓</td>
                      </tr>
                      <tr>
                        <td style="padding:11px 16px;font-weight:700;color:#111;">Balance Due</td>
                        <td style="padding:11px 16px;color:#333;">$${remaining} <span style="color:#888;font-size:12px;">(due at service)</span></td>
                      </tr>
                      ${notes ? `<tr style="background:#f9fafb;"><td style="padding:11px 16px;font-weight:700;color:#111;vertical-align:top;">Notes</td><td style="padding:11px 16px;color:#555;">${notes}</td></tr>` : ''}
                    </table>

                    <!-- CTA / Contact -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;padding:0;margin-bottom:24px;">
                      <tr>
                        <td style="padding:18px 20px;">
                          <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#111;">Need to make changes?</p>
                          <p style="margin:0;font-size:13px;color:#555;line-height:1.7;">Reply to this email or call <a href="tel:7735847821" style="color:#c41e3a;font-weight:700;">(773) 584-7821</a>. We're here to help.</p>
                        </td>
                      </tr>
                    </table>

                    <p style="font-size:13px;color:#999;margin:0;">— The C4 Services Team<br>
                    <a href="https://c4service.co" style="color:#c41e3a;text-decoration:none;">c4service.co</a> &nbsp;·&nbsp;
                    <a href="mailto:support@c4service.co" style="color:#c41e3a;text-decoration:none;">support@c4service.co</a></p>
                  </td>
                </tr>

              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `
    })

    // ── Management notification ───────────────────────────────────────────
    await resend.emails.send({
      from: 'C4 Services <support@c4service.co>',
      to: ['c4mgmtgroup@gmail.com'],
      subject: `New Booking: ${customerName} — ${studio ? `Studio ${studioStart}–${studioEnd} on ${bookingDate}` : service}`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
            <tr><td align="center">
              <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">
                <tr>
                  <td style="background:#111;border-radius:12px 12px 0 0;padding:24px 32px;">
                    <div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:.06em;font-family:Arial Black,Arial,sans-serif;">C4 SERVICES</div>
                    <div style="font-size:12px;color:rgba(255,255,255,0.45);margin-top:4px;letter-spacing:.08em;text-transform:uppercase;">New Booking — Payment Confirmed</div>
                  </td>
                </tr>
                <tr>
                  <td style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:28px 32px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;font-size:14px;">
                      <tr style="background:#f9fafb;"><td style="padding:10px 14px;font-weight:700;width:150px;">Customer</td><td style="padding:10px 14px;">${customerName}</td></tr>
                      <tr><td style="padding:10px 14px;font-weight:700;">Email</td><td style="padding:10px 14px;"><a href="mailto:${email}" style="color:#c41e3a;">${email}</a></td></tr>
                      <tr style="background:#f9fafb;"><td style="padding:10px 14px;font-weight:700;">Phone</td><td style="padding:10px 14px;">${phone || 'Not provided'}</td></tr>
                      <tr><td style="padding:10px 14px;font-weight:700;">Service</td><td style="padding:10px 14px;">${service}</td></tr>
                      <tr style="background:#f9fafb;"><td style="padding:10px 14px;font-weight:700;">Date</td><td style="padding:10px 14px;">${bookingDate}</td></tr>
                      ${studio ? `<tr><td style="padding:10px 14px;font-weight:700;">Time Slot</td><td style="padding:10px 14px;">${studioStart} – ${studioEnd}</td></tr>` : ''}
                      <tr style="background:#f9fafb;"><td style="padding:10px 14px;font-weight:700;">Deposit Paid</td><td style="padding:10px 14px;color:#16a34a;font-weight:700;">$${depositPaid}</td></tr>
                      <tr><td style="padding:10px 14px;font-weight:700;">Total</td><td style="padding:10px 14px;">$${total}</td></tr>
                      <tr style="background:#f9fafb;"><td style="padding:10px 14px;font-weight:700;">Balance Due</td><td style="padding:10px 14px;">$${remaining}</td></tr>
                      ${notes ? `<tr><td style="padding:10px 14px;font-weight:700;vertical-align:top;">Notes</td><td style="padding:10px 14px;">${notes}</td></tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `
    })
  }

  res.status(200).json({ received: true })
}
