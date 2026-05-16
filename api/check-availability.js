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

  const { date, startTime, endTime } = req.body
  if (!date || !startTime || !endTime) return res.status(400).json({ error: 'Missing fields' })

  const reqStart = timeToHours(startTime)
  const reqEnd = timeToHours(endTime)
  if (reqEnd <= reqStart) return res.status(400).json({ error: 'Invalid time range' })

  try {
    // Check completed (paid) sessions for the same date
    const sessions = await stripe.checkout.sessions.list({ status: 'complete', limit: 100 })

    const conflict = sessions.data.some(s => {
      if (s.metadata?.studioDate !== date) return false
      const bStart = parseFloat(s.metadata?.studioStartHours || '0')
      const bEnd = parseFloat(s.metadata?.studioEndHours || '0')
      return overlaps(reqStart, reqEnd, bStart, bEnd)
    })

    res.status(200).json({ available: !conflict })
  } catch (err) {
    console.error(err)
    // If check fails, allow through — checkout does its own final check
    res.status(200).json({ available: true })
  }
}
