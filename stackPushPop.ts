import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { Interface } from "@ethersproject/abi"
import { Account, Address, BN } from 'ethereumjs-util'
import { Transaction } from '@ethereumjs/tx'
import VM from '@ethereumjs/vm'
const solc = require('solc')



/**
 * This function creates the input for the Solidity compiler.
 *
 * For more info about it, go to https://solidity.readthedocs.io/en/v0.5.10/using-the-compiler.html#compiler-input-and-output-json-description
 */
function getSolcInput() {
    return {
        language: 'Solidity',
        sources: {
            'contracts/StackPushPop.sol': {
                content: readFileSync(join(__dirname, 'contracts', 'StackPushPop', 'StackPushPop.sol'), 'utf8'),
            },
            // If more contracts were to be compiled, they should have their own entries here
        },
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
            evmVersion: 'petersburg',
            outputSelection: {
                '*': {
                    '*': ['abi', 'evm.bytecode'],
                },
            },
        },
    }
}

/**
 * This function compiles all the contracts in `contracts/` and returns the Solidity Standard JSON
 * output. If the compilation fails, it returns `undefined`.
 *
 * To learn about the output format, go to https://solidity.readthedocs.io/en/v0.5.10/using-the-compiler.html#compiler-input-and-output-json-description
 */
function compileContracts() {
    const input = getSolcInput()
    const output = JSON.parse(solc.compile(JSON.stringify(input)))

    let compilationFailed = false

    if (output.errors) {
        for (const error of output.errors) {
            if (error.severity === 'error') {
                console.error(error.formattedMessage)
                compilationFailed = true
            } else {
                console.warn(error.formattedMessage)
            }
        }
    }

    if (compilationFailed) {
        return undefined
    }

    return output
}

function getStackPushPopDeploymentBytecode(solcOutput: any): any {
    return solcOutput.contracts['contracts/StackPushPop.sol'].StackPushPop.evm.bytecode.object
}

async function getAccountNonce(vm: VM, accountPrivateKey: Buffer) {
    const address = Address.fromPrivateKey(accountPrivateKey)
    const account = await vm.stateManager.getAccount(address)
    return account.nonce
}

async function deployContract(
    vm: VM,
    senderPrivateKey: Buffer,
    deploymentBytecode: Buffer,
): Promise<Address> {
    // Contracts are deployed by sending their deployment bytecode to the address 0
    // The contract params should be abi-encoded and appended to the deployment bytecode.

    const txData = {
        value: 0,
        gasLimit: 2000000, // We assume that 2M is enough,
        gasPrice: 1,
        data: '0x' + deploymentBytecode.toString('hex') /*+ params.slice(2)*/,
        nonce: await getAccountNonce(vm, senderPrivateKey),
    }

    const tx = Transaction.fromTxData(txData).sign(senderPrivateKey)

    const deploymentResult = await vm.runTx({ tx })

    if (deploymentResult.execResult.exceptionError) {
        throw deploymentResult.execResult.exceptionError
    }

    return deploymentResult.createdAddress!
}

async function StartPushPop(
    vm: VM,
    senderPrivateKey: Buffer,
    contractAddress: Address,
) {
    const sigHash = new Interface(['function push_pop()']).getSighash('push_pop')
    const txData = {
        to: contractAddress,
        value: 0,
        gasLimit: 2000000, // We assume that 2M is enough,
        gasPrice: 1,
        data: sigHash /*+ params.slice(2)*/,
        nonce: await getAccountNonce(vm, senderPrivateKey),
    }

    const tx = Transaction.fromTxData(txData).sign(senderPrivateKey)

    return tx
}

type MemoryMapping = { [address: string]: string }

interface BusValue {
    memory: MemoryMapping;
    stack: string[];
    opcode: string;
    pc: number;
}

function formatMem(memory: Buffer, memoryWordCount: BN): MemoryMapping {
    const count = memoryWordCount.toNumber()
    const result: MemoryMapping = {}
    for (let i = 0; i < count; i++) {
        const offset = i * 32
        result[offset.toString(16)] = memory.slice(offset, offset + 32).toString('hex')
    }
    return result
}


function toBusMapping(data: any): BusValue {
    return {
        memory: formatMem(data.memory, data.memoryWordCount),
        stack: data.stack.map((x: BN) => x.toString('hex')),
        opcode: data.opcode.name,
        pc: data.pc
    }
}

async function recordTxTrace(vm: VM, tx: Transaction, outputPath: string) {
    const vmTrace: BusValue[] = []
    function listener(data: any) {
        const trace = toBusMapping(data)
        console.log(trace)
        vmTrace.push(trace)
    }
    vm.on('step', listener)
    const result = await vm.runTx({ tx })

    if (result.execResult.exceptionError) {
        throw result.execResult.exceptionError
    }

    vm.off('step', listener)

    writeFileSync(outputPath, JSON.stringify(vmTrace, undefined, 4))

}

async function main() {
    const accountPk = Buffer.from(
        'e331b6d69882b4cb4ea581d88e0b604039a3de5967688d3dcffdd2270c0fd109',
        'hex',
    )

    const accountAddress = Address.fromPrivateKey(accountPk)

    console.log('Account: ', accountAddress.toString())

    const acctData = {
        nonce: 0,
        balance: new BN(10).pow(new BN(18)), // 1 eth
    }
    const account = Account.fromAccountData(acctData)

    const vm = new VM()

    await vm.stateManager.putAccount(accountAddress, account)

    console.log('Set account a balance of 1 ETH')

    console.log('Compiling...')

    const solcOutput = compileContracts()
    if (solcOutput === undefined) {
        throw new Error('Compilation failed')
    } else {
        console.log('Compiled the contract')
    }

    const bytecode = getStackPushPopDeploymentBytecode(solcOutput)

    console.log('Deploying the contract...')

    const contractAddress = await deployContract(vm, accountPk, bytecode)

    console.log('Contract address:', contractAddress.toString())

    const tx = await StartPushPop(vm, accountPk, contractAddress,)

    await recordTxTrace(vm, tx, "contracts/StackPushPop/vmTrace.json")
    const tx2 = await StartPushPop(vm, accountPk, contractAddress,)
    await recordTxTrace(vm, tx2, "contracts/StackPushPop/vmTrace2.json")

}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
