const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end()

  const {
    firstName, lastName, email, phone,
    address, eventDate, rentalItem,
    depositAmount, totalAmount, notes
  } = req.body

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
        notes: notes || ''
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
