#!/usr/bin/env node

import {
    RabbitMQ,
    SqlDB,
    objHasProp,
    Logger,
    Types,
    GateWays
} from 'ikomida-shared';
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
    .replace(/^\w/, m => m.toUpperCase())
    .replace(/-\w/g, m => m[1].toUpperCase())

class ContractsCheckJob {
    logger
    asaasGateway

    constructor() {
        this.logger = Logger.getInstance(name)
        SqlDB.SettingModel.findOne({
            where: {
                name: 'sandBox',
            }
        }).then(setting => {
            SqlDB.SettingModel.findOne({
                where: {
                    name: setting.value === '1' ? 'asaasAccessTokenSandBox' : 'asaasAccessToken',
                }
            }).then(asaasSetting => {
                this.asaasGateway = new GateWays.Asaas(this.logger, asaasSetting.value, setting.value === '1')
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
            const contracts = await SqlDB.ContractModel.findAll({
                order: [
                    ['createdAt', 'DESC']
                ],
                include: {
                    model: SqlDB.ContractPaymentSignatureModel,
                    required: true,
                    where: {
                        status: {
                            [SqlDB.Op.notIn]: [Types.PaymentStatusTypes.AsaasSignature.CANCELED]
                        }
                    }
                }
            })
            for (const contract of contracts) {
                const contractPaymentSignature = contract?.contractPaymentSignature
                let subscription = await this.asaasGateway?.getSubscription(contractPaymentSignature?.subscriptionID)
                contractPaymentSignature.status = subscription?.deleted ? Types.PaymentStatusTypes.AsaasSignature.CANCELED : subscription?.status
                contractPaymentSignature.cycle = subscription?.cycle
                contractPaymentSignature.value = subscription?.value
                contractPaymentSignature.netValue = subscription?.netValue
                await contractPaymentSignature.save()
            }
        } catch (exception) {
            this.logger.error(exception)
        }
    }
}

await (new ContractsCheckJob).run()