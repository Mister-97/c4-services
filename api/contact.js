const { Resend } = require('resend')
const resend = new Resend(process.env.RESEND_API_KEY)

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end()

  const { 'first-name': firstName, 'last-name': lastName, email, phone, service, message } = req.body

  try {
    await resend.emails.send({
      from: 'C4 Services <no-reply@c4service.co>',
      to: ['c4mgmtgroup@gmail.com'],
      replyTo: email,
      subject: `New Contact: ${firstName} ${lastName} — ${service || 'General'}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;color:#222;">
          <div style="background:#c41e3a;padding:20px 24px;border-radius:12px 12px 0 0;">
            <h2 style="margin:0;color:#fff;font-size:20px;">New Contact Form Submission</h2>
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">C4 Services</p>
          </div>
          <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:24px;">
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr style="background:#f9fafb;"><td style="padding:10px 14px;font-weight:bold;width:130px;">Name</td><td style="padding:10px 14px;">${firstName} ${lastName}</td></tr>
              <tr><td style="padding:10px 14px;font-weight:bold;">Email</td><td style="padding:10px 14px;"><a href="mailto:${email}" style="color:#c41e3a;">${email}</a></td></tr>
              <tr style="background:#f9fafb;"><td style="padding:10px 14px;font-weight:bold;">Phone</td><td style="padding:10px 14px;">${phone || 'Not provided'}</td></tr>
              <tr><td style="padding:10px 14px;font-weight:bold;">Service</td><td style="padding:10px 14px;">${service || 'General'}</td></tr>
              <tr style="background:#f9fafb;"><td style="padding:10px 14px;font-weight:bold;vertical-align:top;">Message</td><td style="padding:10px 14px;line-height:1.6;">${message}</td></tr>
            </table>
          </div>
        </div>
      `
    })
    res.status(200).json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
