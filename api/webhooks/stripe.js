const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const { kv } = require('@vercel/kv')

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end()

  const sig = req.headers['stripe-signature']
  let event

  try {
    const rawBody = await getRawBody(req)
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    return res.status(400).json({ error: `Webhook error: ${err.message}` })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const { studioDate, studioStart, studioEnd } = session.metadata || {}

    if (studioDate && studioStart && studioEnd) {
      const bookings = (await kv.get(`bookings:${studioDate}`)) || []
      const updated = bookings.map(b =>
        b.sessionId === session.id ? { ...b, status: 'confirmed' } : b
      )
      // Keep confirmed bookings for 90 days
      await kv.set(`bookings:${studioDate}`, updated, { ex: 90 * 24 * 60 * 60 })
    }
  }

  res.status(200).json({ received: true })
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.setEncoding('utf8')
    req.on('data', chunk => { data += chunk })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}
