import { FedaPay, Transaction } from 'fedapay'

const PLANS: Record<string, number> = {
  basic: 2000,
  premium: 5000,
}

export async function createTransaction(plan: string, userPhone: string) {
  FedaPay.setApiKey(process.env.FEDAPAY_API_KEY!)
  FedaPay.setEnvironment('sandbox')

  const amount = PLANS[plan]
  if (!amount) throw new Error(`Plan inconnu : ${plan}`)

  const transaction = await Transaction.create({
    description: `Abonnement MotoAmbulance — ${plan}`,
    amount,
    currency: { iso: 'XOF' },
    callback_url: `${process.env.APP_URL}/subscriptions/webhook`,
    customer: { phone_number: { number: userPhone, country: 'BJ' } },
  })

  const token = await (transaction as any).generateToken()

  return {
    transactionId: transaction.id,
    paymentUrl: token.url,
  }
}
