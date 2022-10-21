import { Utils, DBModels, Types, Domain, GateWays } from '@ikomida/shared-backend'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
let { name } = require('../package.json')
name = name
  .replace(/^(@\S+\/)?(svelte-)?(\S+)/, '$3')
  .replace(/^\w/, (m: string) => m.toUpperCase())
  .replace(/-\w/g, (m: string[]) => m[1].toUpperCase())

class ContractsCheckJob {
  logger
  asaasGateway?: GateWays.Asaas

  constructor() {
    this.logger = Utils.Logger.getInstance(name)
    this.asaasGateway = new GateWays.Asaas(this.logger)
  }

  async run() {
    try {
      this.logger.error(`Contracts checker started...!`)
      const contracts = await DBModels.ContractModel.findAll({
        order: [['createdAt', 'DESC']],
        include: {
          model: DBModels.ContractPaymentSignatureModel,
          required: true,
          where: {
            status: {
              [Domain.SqlDB.Op.notIn]: [Types.Types.TAsaasSignatureStatus.CANCELED]
            }
          }
        }
      })
      for (const contract of contracts) {
        const contractPaymentSignature = contract.contractPaymentSignature
        if (
          !(contractPaymentSignature instanceof DBModels.ContractPaymentSignatureModel) ||
          !contractPaymentSignature?.subscriptionID
        ) {
          this.logger.error('A assinatura ou id nao foi localizado!')
          continue
        }
        const subscriptionResponse = await this.asaasGateway?.getSubscription(contractPaymentSignature.subscriptionID)
        if (!subscriptionResponse?.success) {
          this.logger.error(`Nao foi possivel obter a assinatura: ${contractPaymentSignature.subscriptionID}!`)
          continue
        }
        const subscription = subscriptionResponse.data
        const paymentStatus = subscription?.status
        if (paymentStatus) {
          contractPaymentSignature.status = subscription?.deleted
            ? Types.Types.TAsaasSignatureStatus.CANCELED
            : paymentStatus
          contractPaymentSignature.cycle = subscription?.cycle
          contractPaymentSignature.value = subscription?.value
          await contractPaymentSignature.save()
        }
      }
    } catch (exception) {
      this.logger.error(exception)
    }
  }
}

await new ContractsCheckJob().run()
