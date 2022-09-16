import { Utils, DBModels, Types, Domain, GateWays } from '@ikomida/shared-backend'
import {
    createRequire
} from "module";
const require = createRequire(
    import.meta.url)
let {
    name
} = require("../package.json")
name = name
    .replace(/^(@\S+\/)?(svelte-)?(\S+)/, '$3')
    .replace(/^\w/, (m: string) => m.toUpperCase())
    .replace(/-\w/g, (m: string[]) => m[1].toUpperCase())

class ContractsCheckJob {
    logger
    asaasGateway?: GateWays.Asaas

    constructor() {
        this.logger = Utils.Logger.getInstance(name)
        DBModels.SettingModel.findOne({
            where: {
                name: 'sandBox',
            }
        }).then(setting => {
            DBModels.SettingModel.findOne({
                where: {
                    name: setting?.value === '1' ? 'asaasAccessTokenSandBox' : 'asaasAccessToken',
                }
            }).then(asaasAccessToken => {
                this.asaasGateway = new GateWays.Asaas(this.logger, asaasAccessToken?.value ?? '', setting?.value === '1')
            }).catch(exception => {
                console.error(exception)
                process.exit(1)
            })
        }).catch(exception => {
            console.error(exception)
            process.exit(1)
        })
    }

    async run() {
        try {
            const contracts = await DBModels.ContractModel.findAll({
                order: [
                    ['createdAt', 'DESC']
                ],
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
                const contractPaymentSignature = contract?.contractPaymentSignature as DBModels.ContractPaymentSignatureModel
                if (!contractPaymentSignature && !((contractPaymentSignature as DBModels.ContractPaymentSignatureModel).subscriptionID)) {
                    continue
                }
                const subscriptionResponse = await this.asaasGateway?.getSubscription(contractPaymentSignature?.subscriptionID ?? '')
                if (!subscriptionResponse?.success) {
                    continue
                }
                const subscription = subscriptionResponse.data
                const paymentStatus = Types.Types.TAsaasSignatureStatus.valueOf(subscription?.status)
                if (paymentStatus && contractPaymentSignature) {
                    contractPaymentSignature.status = subscription?.deleted ? Types.Types.TAsaasSignatureStatus.CANCELED : paymentStatus
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

await (new ContractsCheckJob).run()