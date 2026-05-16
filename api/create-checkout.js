const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

function timeToHours(t) {
  if (!t) return 0
  if (t.includes('midnight')) return 24
  const [time, meridiem] = t.split(' ')
  let [h, m] = time.split(':').map(Number)
  if (meridiem === 'PM' && h !== 12) h += 12
  if (meridiem === 'AM' && h === 12) h = 0
  return h + m / 60
}

function overlaps(aStart, aEnd, bStart, bEnd) {
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

  // Final conflict check before charging — prevents race conditions
  if (studioDate && studioStart && studioEnd) {
    const reqStart = timeToHours(studioStart)
    const reqEnd = timeToHours(studioEnd)

    try {
      const sessions = await stripe.checkout.sessions.list({ status: 'complete', limit: 100 })
      const conflict = sessions.data.some(s => {
        if (s.metadata?.studioDate !== studioDate) return false
        const bStart = parseFloat(s.metadata?.studioStartHours || '0')
        const bEnd = parseFloat(s.metadata?.studioEndHours || '0')
        return overlaps(reqStart, reqEnd, bStart, bEnd)
      })

      if (conflict) {
        return res.status(409).json({ error: 'That time slot was just booked. Please choose another.' })
      }
    } catch (err) {
      console.error('Conflict check failed:', err)
    }
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: email,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30-min window
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
        studioStartHours: studioDate ? String(timeToHours(studioStart)) : '',
        studioEndHours: studioDate ? String(timeToHours(studioEnd)) : '',
      },
      success_url: `${process.env.SITE_URL}/thank-you.html`,
      cancel_url: `${process.env.SITE_URL}/services/recording-studio.html`,
    })

    res.status(200).json({ url: session.url })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
