const dotenv = require("dotenv");
dotenv.config();
const readline = require("readline");
const https = require("https");

const colors = {
    green: '\x1b[92m',
    yellow: '\x1b[93m',
    red: '\x1b[91m',
    cyan: '\x1b[96m',
    white: '\x1b[97m',
    bold: '\x1b[1m',
    reset: '\x1b[0m',
    magenta: '\x1b[95m',
    blue: '\x1b[94m',
    gray: '\x1b[90m',
};

const logger = {
    info: (msg) => console.log(`${colors.cyan}[i] ${msg}${colors.reset}`),
    warn: (msg) => console.log(`${colors.yellow}[!] ${msg}${colors.reset}`),
    error: (msg) => console.log(`${colors.red}[x] ${msg}${colors.reset}`),
    success: (msg) => console.log(`${colors.green}[+] ${msg}${colors.reset}`),
    loading: (msg) => console.log(`${colors.magenta}[*] ${msg}${colors.reset}`),
    step: (msg) => console.log(`${colors.blue}[>] ${colors.bold}${msg}${colors.reset}`),
    critical: (msg) => console.log(`${colors.red}${colors.bold}[FATAL] ${msg}${colors.reset}`),
    summary: (msg) => console.log(`${colors.green}${colors.bold}[SUMMARY] ${msg}${colors.reset}`),
    banner: () => {
        const border = `${colors.blue}${colors.bold}╔═════════════════════════════════════════╗${colors.reset}`;
        const title = `${colors.blue}${colors.bold}║   🍉 19Seniman From Insider   🍉    ║${colors.reset}`;
        const bottomBorder = `${colors.blue}${colors.bold}╚═════════════════════════════════════════╝${colors.reset}`;
        
        console.log(`\n${border}`);
        console.log(`${title}`);
        console.log(`${bottomBorder}\n`);
    },
    section: (msg) => {
        const line = '─'.repeat(40);
        console.log(`\n${colors.gray}${line}${colors.reset}`);
        if (msg) console.log(`${colors.white}${colors.bold} ${msg} ${colors.reset}`);
        console.log(`${colors.gray}${line}${colors.reset}\n`);
    },
    countdown: (msg) => process.stdout.write(`\r${colors.blue}[⏰] ${msg}${colors.reset}`),
};


let ethersMod = null;
async function E() { if (!ethersMod) ethersMod = await import("ethers"); return ethersMod; }

const NET = {
    intuition: {
        name: "Intuition Testnet",
        chainId: 13579,
        rpc: "https://testnet.rpc.intuition.systems/http",
        explorer: "https://testnet.explorer.intuition.systems"
    },
    baseSepolia: {
        name: "Base Sepolia",
        chainId: 84532,
        rpc: "https://sepolia.base.org",
        explorer: "https://sepolia.basescan.org"
    }
};

const ARBSYS_ADDR = "0x0000000000000000000000000000000000000064";
const ARBSYS_ABI = [
    "function arbBlockNumber() view returns (uint256)",
    "function withdrawEth(address dest) payable returns (uint256)"
];

const ERC20_INBOX_ADDR = "0xBd983e1350263d1BE5DE4AEB8b1704A0Ea0be350";
const TTRUST_TOKEN_ADDR = "0xA54b4E6e356b963Ee00d1C947f478d9194a1a210";
const ERC20_OUTBOX_ADDR = "0xBEC1462f12f8a968e07ae3D60C8C32Cd32A23826";

const ERC20_INBOX_ABI = [
    "function createRetryableTicket(address to, uint256 l2CallValue, uint256 maxSubmissionCost, address excessFeeRefundAddress, address callValueRefundAddress, uint256 gasLimit, uint256 maxFeePerGas, uint256 tokenTotalFeeAmount, bytes data) returns (uint256)"
];

const ERC20_OUTBOX_ABI = [
    "event L2ToL1Tx(address caller, address indexed destination, uint256 indexed hash, uint256 indexed position, address indexed token, uint256 amount)",
    "function executeTransaction(bytes32[] proof, uint256 index, address l2Sender, address to, uint256 l2Block, uint256 l1Block, uint256 l2Timestamp, uint256 value, bytes data) returns ()"
];

const TTRUST_ABI = [
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)"
];

const TNS_CONTRACT_ADDR = "0xb4D38068F8982c15CaD9f98adE6C2954567e2153";
const TNS_ABI = [
    "function register(string name, uint256 duration) payable returns (uint256)"
];

function rlOpen() { return readline.createInterface({ input: process.stdin, output: process.stdout }); }
function ask(rl, q) { return new Promise(res => rl.question(q, ans => res(ans))); }

function normalizePk(pk) {
    let s = String(pk || "").trim();
    if (!s) return null;
    if (!s.startsWith("0x")) s = "0x" + s;
    return s;
}
function loadPrivateKeys() {
    const ent = Object.entries(process.env)
        .filter(([k]) => /^PRIVATE_KEY_\d+$/i.test(k))
        .sort((a, b) => parseInt(a[0].match(/\d+/)[0], 10) - parseInt(b[0].match(/\d+/)[0], 10));
    const pks = [];
    for (const [, v] of ent) { const pk = normalizePk(v); if (pk) pks.push(pk); }
    return pks;
}
async function provider(rpc) { const { JsonRpcProvider } = await E(); return new JsonRpcProvider(rpc); }
async function wallet(pk, prov) { const { Wallet } = await E(); return new Wallet(pk, prov); }

function fmtEther(ethers, weiBigInt) {
    return ethers.formatEther(weiBigInt);
}
async function getFeeParams(provider) {
    const fee = await provider.getFeeData();
    return {
        gasPrice: fee.gasPrice ?? null,
        maxFeePerGas: fee.maxFeePerGas ?? null,
        maxPriorityFeePerGas: fee.maxPriorityFeePerGas ?? null,
    };
}

function httpsRequest(options, data = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    resolve({ statusCode: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, data: body });
                }
            });
        });
        
        req.on('error', reject);
        
        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

async function checkDomainAvailability(domainName) {
    const options = {
        hostname: 'tns.intuition.box',
        port: 443,
        path: `/api/domains/search/${domainName}`,
        method: 'GET',
        headers: { 'accept': '*/*' }
    };
    try {
        const response = await httpsRequest(options);
        return response.statusCode === 200 ? response.data : null;
    } catch (error) {
        logger.error(`Domain check error: ${error.message}`);
        return null;
    }
}

async function registerDomainAPI(domainName, ownerAddress, txHash) {
    const options = {
        hostname: 'tns.intuition.box',
        port: 443,
        path: '/api/domains/register',
        method: 'POST',
        headers: { 'content-type': 'application/json' }
    };
    const data = { name: domainName, owner: ownerAddress, duration: 1, txHash };
    try {
        const response = await httpsRequest(options, data);
        return response.statusCode === 200 ? response.data : null;
    } catch (error) {
        logger.error(`Domain registration API error: ${error.message}`);
        return null;
    }
}

async function registerTrustDomain(intuitionWallet, domainName) {
    const ethers = await E();
    const provider = intuitionWallet.provider;
    const cleanDomainName = domainName.replace('.trust', '');

    logger.loading(`Checking availability of ${cleanDomainName}.trust...`);
    const availability = await checkDomainAvailability(cleanDomainName);
    
    if (!availability) throw new Error("Failed to check domain availability");
    if (!availability.available) {
        logger.error(`Domain ${availability.name} is not available!`);
        return null;
    }
    
    logger.info(`Domain ${availability.name} is available! Price: ${availability.pricing.pricePerYear} tTRUST`);

    const tnsContract = new ethers.Contract(TNS_CONTRACT_ADDR, TNS_ABI, intuitionWallet);
    const value = ethers.parseEther(availability.pricing.pricePerYear);
    const bal = await provider.getBalance(intuitionWallet.address);
    const feeParams = await getFeeParams(provider);

    let estGas;
    try {
        estGas = await tnsContract.register.estimateGas(cleanDomainName, 1, { value });
    } catch(e) {
        throw new Error(`Gas estimation for domain registration failed: ${e.shortMessage || e.message}`);
    }
    
    const perGas = feeParams.maxFeePerGas ?? feeParams.gasPrice;
    const feeWei = perGas ? (estGas * perGas) : 0n;
    const required = value + feeWei;

    logger.info(`Balance: ${fmtEther(ethers, bal)} tTRUST | Required: ~${fmtEther(ethers, required)} tTRUST`);

    if (perGas && bal < required) {
        throw new Error("Insufficient balance for domain registration");
    }

    logger.loading(`Registering ${cleanDomainName}.trust for ${intuitionWallet.address}...`);
    const tx = await tnsContract.register(cleanDomainName, 1, { value });
    logger.info(`Registration tx: ${tx.hash}`);
    const rec = await tx.wait();

    if (rec.status === 0) throw new Error("Registration transaction failed");
    
    logger.success(`Domain registration transaction completed in block ${rec.blockNumber}`);

    logger.loading("Registering domain via TNS API...");
    const apiResult = await registerDomainAPI(cleanDomainName, intuitionWallet.address, tx.hash);
    
    if (apiResult && apiResult.message === "Domain registered successfully") {
        logger.success(`Domain ${apiResult.domain.name} registered successfully!`);
        return { txHash: tx.hash, domain: apiResult.domain };
    } else {
        logger.warn("Blockchain transaction succeeded but API registration may have failed");
        return { txHash: tx.hash, domain: null };
    }
}

async function bridgeBaseToIntuition(baseWallet, amountTTrust, destL2Address) {
    const ethers = await E();
    const provider = baseWallet.provider;
    const tTrustToken = new ethers.Contract(TTRUST_TOKEN_ADDR, TTRUST_ABI, baseWallet);
    const erc20Inbox = new ethers.Contract(ERC20_INBOX_ADDR, ERC20_INBOX_ABI, baseWallet);
    const value = ethers.parseEther(String(amountTTrust));

    // Pengecekan saldo di awal
    const tokenBal = await tTrustToken.balanceOf(baseWallet.address);
    if (tokenBal < value) {
        throw new Error(`Insufficient tTRUST balance. Have ${fmtEther(ethers, tokenBal)}, need ${amountTTrust}.`);
    }

    logger.info(`Bridging ${amountTTrust} tTRUST to ${destL2Address || baseWallet.address}`);
    
    const allowance = await tTrustToken.allowance(baseWallet.address, ERC20_INBOX_ADDR);
    if (allowance < value) {
        logger.loading("Approving tTRUST spending...");
        const approveTx = await tTrustToken.approve(ERC20_INBOX_ADDR, value);
        await approveTx.wait();
        logger.success("Approval completed");
    }

    const params = {
        to: destL2Address || baseWallet.address, l2CallValue: 10000000000000n,
        maxSubmissionCost: 0n, excessFeeRefundAddress: baseWallet.address,
        callValueRefundAddress: baseWallet.address, gasLimit: 27514n,
        maxFeePerGas: 600000000n, tokenTotalFeeAmount: value, data: "0x"
    };

    logger.loading(`Creating retryable ticket for ${amountTTrust} tTRUST bridge...`);
    const tx = await erc20Inbox.createRetryableTicket(...Object.values(params));
    logger.info(`Bridge tx (Create Retryable Ticket): ${tx.hash}`);
    const rec = await tx.wait();
    if (rec.status === 0) throw new Error("Create retryable ticket failed");

    logger.success(`Retryable ticket created in block ${rec.blockNumber}`);
    logger.info("Bridging from L1 to L2 is initiated. Funds will arrive on Intuition automatically.");
    return { txHash: tx.hash, status: 'retryable_ticket_created' };
}

async function withdrawFromIntuition(intuitionWallet, amountEth, destL1Address) {
    const ethers = await E();
    const provider = intuitionWallet.provider;
    const arbSys = new ethers.Contract(ARBSYS_ADDR, ARBSYS_ABI, intuitionWallet);
    const value = ethers.parseEther(String(amountEth));
    
    logger.loading(`L2→L1 withdrawal ${amountEth} tTRUST from ${intuitionWallet.address} → ${destL1Address}`);
    
    const tx = await arbSys.withdrawEth(destL1Address, { value });
    logger.info(`Withdrawal tx (L2): ${tx.hash}`);
    const rec = await tx.wait();

    if (rec.status === 0) throw new Error("Withdrawal transaction failed");
    
    logger.success(`Withdrawal submitted on L2, block ${rec.blockNumber}.`);
    return { txHash: tx.hash };
}

async function finalizeBridgeToBase(baseWallet, l2TxHash) {
    const ethers = await E();
    const l2Provider = await provider(NET.intuition.rpc);
    
    logger.loading(`Finalizing withdrawal for L2 tx: ${l2TxHash}`);

    const l2Receipt = await l2Provider.getTransactionReceipt(l2TxHash);
    if (!l2Receipt) throw new Error("Could not get L2 transaction receipt.");

    const l2ToL1Log = l2Receipt.logs.find(log => log.topics[0] === "0x3e7aafa77dbf186b7fd488006beff893744caa3c4f6f299e8a709fa2087374fc");
    if (!l2ToL1Log) throw new Error("Could not find the L2ToL1Tx log in the L2 receipt.");

    const l2Block = l2Receipt.blockNumber;
    const index = ethers.dataSlice(l2ToL1Log.topics[3], 0);

    logger.info(`Withdrawal details: Index ${index}, L2 Block ${l2Block}`);
    logger.loading("Waiting for withdrawal to be ready on L1 (approx. 2 mins)...");
    await new Promise(resolve => setTimeout(resolve, 120000));

    logger.loading("Fetching withdrawal proof...");
    const proofResponse = await httpsRequest({
        hostname: 'testnet.bridge.intuition.systems',
        path: `/api/trpc/bridge.getWithdrawalProof?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%22l2ChainId%22%3A${NET.intuition.chainId}%2C%22l2BlockNumber%22%3A${Number(l2Block)}%2C%22l2ToL1MsgIndex%22%3A${parseInt(index, 16)}%7D%7D%7D`,
        method: 'GET'
    });

    const proofData = proofResponse.data[0]?.result?.data?.json;
    if (!proofData || !proofData.proof) throw new Error("Failed to fetch withdrawal proof.");
    
    logger.success("Successfully fetched withdrawal proof.");
    
    logger.loading("Executing finalization transaction on L1...");
    const outboxContract = new ethers.Contract(ERC20_OUTBOX_ADDR, ERC20_OUTBOX_ABI, baseWallet);
    const tx = await outboxContract.executeTransaction(
        proofData.proof, index, proofData.message.l2Sender, proofData.message.to,
        l2Block, await baseWallet.provider.getBlockNumber(), proofData.message.l2Timestamp,
        proofData.message.value, proofData.message.data
    );

    logger.info(`Finalization tx (L1): ${tx.hash}`);
    const rec = await tx.wait();
    if (rec.status === 0) throw new Error("Finalization transaction failed");
    
    logger.success(`Withdrawal finalized successfully in L1 block ${rec.blockNumber}!`);
    return { txHash: tx.hash };
}

/**
 * Fungsi utama untuk menjalankan semua tugas yang dikonfigurasi.
 * @param {object} config - Objek konfigurasi dari input pengguna.
 */
async function runTasks(config) {
    try {
        logger.section(`Starting Scheduled Run at ${new Date().toLocaleString('en-GB')}`);

        const { pks, choice, amtWithdraw, destOnBase, amtDeposit, destOnIntuition, domainName } = config;

        const provIntuition = await provider(NET.intuition.rpc);
        const provBase = await provider(NET.baseSepolia.rpc);

        const walIntuition = await Promise.all(pks.map(pk => wallet(pk, provIntuition)));
        const walBase = await Promise.all(pks.map(pk => wallet(pk, provBase)));

        if (choice === "4") {
            logger.info(`Will register ${domainName}.trust for ${walIntuition.length} wallet(s)`);
            for (let i = 0; i < walIntuition.length; i++) {
                const wL2 = walIntuition[i];
                logger.step(`(${i + 1}/${walIntuition.length}) Registering for: ${wL2.address}`);
                try {
                    const currentDomainName = domainName + (i > 0 ? i : '');
                    await registerTrustDomain(wL2, currentDomainName);
                } catch (e) {
                    logger.error(`Domain registration failed for ${wL2.address}: ${e.message || e}`);
                }
            }
        } else {
            if (choice === "1" || choice === "3") {
                for (let i = 0; i < walIntuition.length; i++) {
                    const wL2 = walIntuition[i];
                    const wL1 = walBase[i];
                    const dest = destOnBase || wL1.address;
                    logger.step(`(${i + 1}/${walIntuition.length}) Starting Withdrawal for ${wL2.address}`);
                    try {
                        const withdrawRes = await withdrawFromIntuition(wL2, amtWithdraw, dest);
                        await finalizeBridgeToBase(wL1, withdrawRes.txHash);
                    } catch (e) {
                        logger.error(`Full withdrawal process failed for ${wL2.address}: ${e.message || e}`);
                    }
                }
            }
            if (choice === "2" || choice === "3") {
                for (let i = 0; i < walBase.length; i++) {
                    const wL1 = walBase[i];
                    const dest = destOnIntuition || walIntuition[i].address;
                    logger.step(`(${i + 1}/${walBase.length}) Bridge to Intuition: ${wL1.address} → ${dest}`);
                    try {
                        await bridgeBaseToIntuition(wL1, amtDeposit, dest);
                    } catch (e) {
                        // PENANGANAN EROR YANG DIPERBARUI
                        if (e.message && (e.message.includes('transfer amount exceeds balance') || e.message.includes('Insufficient tTRUST balance'))) {
                            logger.error(`Bridge failed for ${wL1.address}: Saldo token tTRUST tidak cukup.`);
                            logger.warn("Silakan isi saldo tTRUST Anda melalui faucet resmi Intuition di jaringan Base Sepolia.");
                        } else {
                            // Jika eror lain, tampilkan pesan eror seperti biasa
                            logger.error(`Bridge failed for ${wL1.address}: ${e.message || e}`);
                        }
                    }
                }
            }
        }
        logger.summary("All tasks for this run completed.");
    } catch (e) {
        logger.critical(`A critical error occurred during the scheduled run: ${e.message || String(e)}`);
    }
}

/**
 * Fungsi untuk memulai penghitung waktu mundur di konsol.
 * @param {number} duration - Durasi dalam milidetik.
 */
function startCountdown(duration) {
    let timeLeft = duration;
    const intervalId = setInterval(() => {
        timeLeft -= 1000;
        const hours = String(Math.floor((timeLeft / (1000 * 60 * 60)) % 24)).padStart(2, '0');
        const minutes = String(Math.floor((timeLeft / 1000 / 60) % 60)).padStart(2, '0');
        const seconds = String(Math.floor((timeLeft / 1000) % 60)).padStart(2, '0');
        
        if (timeLeft > 0) {
            logger.countdown(`Next run in: ${hours}:${minutes}:${seconds} `);
        } else {
            clearInterval(intervalId);
            process.stdout.write('\n');
        }
    }, 1000);
}


/**
 * Fungsi utama yang dijalankan pertama kali untuk setup dan penjadwalan.
 */
(async function main() {
    const rl = rlOpen();
    try {
        logger.banner();
        const pks = loadPrivateKeys();
        if (pks.length === 0) {
            logger.critical("No PRIVATE_KEY_* values found in .env. Exiting.");
            process.exit(1);
        }
        logger.info(`Loaded ${pks.length} wallet(s) from .env file.`);
        
        logger.section("CONFIGURATION SETUP");
        
        console.log("Choose Your Actions (this will be run automatically every 24 hours):");
        console.log("1) Intuition → Base");
        console.log("2) Base → Intuition");
        console.log("3) Both Actions (Withdraw & Bridge)");
        console.log("4) Register .trust Domain");
        console.log();
        const choice = (await ask(rl, "Enter choice (1-4): ")).trim();
        
        let config = { pks, choice };

        if (choice === "4") {
            config.domainName = (await ask(rl, "Enter domain name (without .trust): ")).trim();
            if (!config.domainName) { logger.critical("Domain name is required."); process.exit(1); }
        } else if (["1", "2", "3"].includes(choice)) {
            if (choice === "1" || choice === "3") {
                config.amtWithdraw = (await ask(rl, "Amount to withdraw from Intuition (e.g., 0.01): ")).trim();
                if (!config.amtWithdraw || Number(config.amtWithdraw) <= 0) { logger.critical("Invalid amount."); process.exit(1); }
                config.destOnBase = (await ask(rl, "Destination on Base Sepolia (input your same address): ")).trim();
            }
            if (choice === "2" || choice === "3") {
                config.amtDeposit = (await ask(rl, "Amount tTRUST to bridge to Intuition (e.g., 0.0001): ")).trim();
                if (!config.amtDeposit || Number(config.amtDeposit) <= 0) { logger.critical("Invalid amount."); process.exit(1); }
                config.destOnIntuition = (await ask(rl, "Destination on Intuition (blank = same address): ")).trim();
            }
        } else {
            logger.critical("Invalid choice. Please enter a number between 1 and 4.");
            process.exit(1);
        }
        
        rl.close(); // Tutup readline setelah selesai konfigurasi

        // Menjalankan tugas untuk pertama kali
        await runTasks(config);

        // Menjadwalkan tugas untuk dijalankan setiap 24 jam
        const twentyFourHoursInMs = 24 * 60 * 60 * 1000;
        logger.section("SCHEDULING");
        logger.info("Initial run complete. The script will now run automatically every 24 hours.");
        
        startCountdown(twentyFourHoursInMs);
        
        setInterval(async () => {
            await runTasks(config);
            logger.info("Run complete. Waiting for the next 24-hour cycle.");
            startCountdown(twentyFourHoursInMs);
        }, twentyFourHoursInMs);

    } catch (e) {
        logger.critical(`An error occurred during initial setup: ${e.message || String(e)}`);
        process.exitCode = 1;
        if (rl) rl.close();
    }
})();
