const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const { kv } = require('@vercel/kv')

function timeToHours(t) {
  if (!t) return 0
  if (t.includes('midnight')) return 24
  const [time, meridiem] = t.split(' ')
  let [h, m] = time.split(':').map(Number)
  if (meridiem === 'PM' && h !== 12) h += 12
  if (meridiem === 'AM' && h === 12) h = 0
  return h + m / 60
}

function slotsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end()

  const {
    firstName, lastName, email, phone,
    address, eventDate, rentalItem,
    depositAmount, totalAmount, notes,
    studioDate, studioStart, studioEnd,
  } = req.body

  // If this is a studio booking, do a final conflict check and reserve the slot
  if (studioDate && studioStart && studioEnd) {
    const reqStart = timeToHours(studioStart)
    const reqEnd = timeToHours(studioEnd)
    const now = Date.now()
    const PENDING_TTL_MS = 30 * 60 * 1000

    const bookings = (await kv.get(`bookings:${studioDate}`)) || []
    const active = bookings.filter(b =>
      b.status === 'confirmed' || (b.status === 'pending' && now - b.createdAt < PENDING_TTL_MS)
    )

    if (active.some(b => slotsOverlap(reqStart, reqEnd, b.start, b.end))) {
      return res.status(409).json({ error: 'That time slot was just booked. Please choose another.' })
    }
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `C4 Services — ${rentalItem}`,
            description: `Event date: ${eventDate}${address && address !== 'C4 Services Recording Studio' ? ` | ${address}` : ''}`,
          },
          unit_amount: Math.round(depositAmount * 100),
        },
        quantity: 1,
      }],
      metadata: {
        firstName, lastName, email, phone,
        address, eventDate, rentalItem,
        totalAmount: String(totalAmount),
        notes: notes || '',
        studioDate: studioDate || '',
        studioStart: studioStart || '',
        studioEnd: studioEnd || '',
      },
      success_url: `${process.env.SITE_URL}/thank-you.html`,
      cancel_url: `${process.env.SITE_URL}/services/recording-studio.html`,
    })

    // Reserve the slot as pending (30-minute hold)
    if (studioDate && studioStart && studioEnd) {
      const bookings = (await kv.get(`bookings:${studioDate}`)) || []
      bookings.push({
        start: timeToHours(studioStart),
        end: timeToHours(studioEnd),
        status: 'pending',
        sessionId: session.id,
        createdAt: Date.now(),
      })
      await kv.set(`bookings:${studioDate}`, bookings, { ex: 90 * 24 * 60 * 60 })
    }

    res.status(200).json({ url: session.url })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
