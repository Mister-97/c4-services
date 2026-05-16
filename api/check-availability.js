const { kv } = require('@vercel/kv')

// Returns decimal hours from "2:00 PM" style string
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

  const { date, startTime, endTime } = req.body
  if (!date || !startTime || !endTime) return res.status(400).json({ error: 'Missing fields' })

  const reqStart = timeToHours(startTime)
  const reqEnd = timeToHours(endTime)
  if (reqEnd <= reqStart) return res.status(400).json({ error: 'Invalid time range' })

  const now = Date.now()
  const PENDING_TTL_MS = 30 * 60 * 1000 // 30 minutes

  const bookings = (await kv.get(`bookings:${date}`)) || []

  // Filter out expired pending bookings
  const active = bookings.filter(b =>
    b.status === 'confirmed' || (b.status === 'pending' && now - b.createdAt < PENDING_TTL_MS)
  )

  const conflict = active.some(b => slotsOverlap(reqStart, reqEnd, b.start, b.end))

  res.status(200).json({ available: !conflict })
}
