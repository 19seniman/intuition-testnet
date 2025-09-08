const dotenv = require("dotenv");
dotenv.config();
const readline = require("readline");
const https = require("https");

// --- KONFIGURASI UNTUK MODE OTOMATIS ---
const AUTO_CONFIG = {
    // Jumlah tTRUST yang akan di-bridge dari Base Sepolia ke Intuition
    DEPOSIT_AMOUNT: "0.001", 
    // Jumlah tTRUST yang akan di-swap ke INTUIT
    SWAP_TTRUST_AMOUNT: "0.0005",
    // Jumlah tTRUST yang akan dipertaruhkan dalam permainan dadu
    DICE_BET_AMOUNT: "0.0002",
    // Jumlah tTRUST yang akan ditarik dari Intuition ke Base Sepolia
    WITHDRAW_AMOUNT: "0.0001",

    // Jeda antar tugas untuk satu dompet (dalam milidetik)
    DELAY_BETWEEN_TASKS_MS: 5000,    // 5 detik
    // Jeda setelah bridging untuk menunggu dana tiba (dalam milidetik)
    DELAY_AFTER_BRIDGE_MS: 300000,   // 5 menit
    // Jeda sebelum beralih ke dompet berikutnya (dalam milidetik)
    DELAY_BETWEEN_WALLETS_MS: 10000, // 10 detik
};
// -----------------------------------------

const colors = {
  green: '\x1b[92m',
  yellow: '\x1b[93m',
  red: '\x1b[91m',
  cyan: '\x1b[96m',
  white: '\x1b[97m',
  magenta: '\x1b[95m',
  blue: '\x1b[94m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
  reset: '\x1b[0m'
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
        const title = `${colors.blue}${colors.bold}║   🍉 19Seniman From Insider    🍉    ║${colors.reset}`;
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
const ERC20_INBOX_ADDR = "0xBd983e1350263d1BE5DE4AEB8b1704A0Ea0be350";
const ERC20_BRIDGE_ADDR = "0xCd02bD4dC76551cE2Db94879bC1e814a9E8C7A40";
const ERC20_OUTBOX_ADDR = "0xBEC1462f12f8a968e07ae3D60C8C32Cd32A23826";
const TTRUST_TOKEN_ADDR = "0xA54b4E6e356b963Ee00d1C947f478d9194a1a210";
const ETH_INBOX_ADDR = "0x6BEbC4925716945D46F0Ec336D5C2564F419682C"; 
const TNS_CONTRACT_ADDR = "0xb4D38068F8982c15CaD9f98adE6C2954567e2153";
const SWAP_CONTRACT_ADDR = "0xc6e7DF5E7b4f2A278906862b61205850344D4e7d";
const INTUIT_TOKEN_ADDR = "0x3Aa5ebB10DC797CAC828524e59A333d0A371443c";
const DICE_CONTRACT_ADDR = "0x2baEa7119627c2c02EFcA3551b81c218B468C768";

const SWAP_TTRUST_TO_INTUIT_METHOD_ID = "0x00d8d10f";
const SWAP_INTUIT_TO_TTRUST_METHOD_ID = "0xc91b4a0e";
const DICE_ROLL_METHOD_ID = "0x7d789dee";

const ARBSYS_ABI = [
  "function arbBlockNumber() view returns (uint256)",
  "function withdrawEth(address dest) payable returns (uint256)"
];
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
const ETH_INBOX_ABI = [
  "function depositEth() payable returns (uint256)",
  "function depositEth(address dest) payable returns (uint256)"
];
const TNS_ABI = [
  "function register(string name, uint256 duration) payable returns (uint256)"
];
const INTUIT_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)"
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
    .sort((a,b) => parseInt(a[0].match(/\d+/)[0],10) - parseInt(b[0].match(/\d+/)[0],10));
  const pks = [];
  for (const [,v] of ent) { const pk = normalizePk(v); if (pk) pks.push(pk); }
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
    headers: {
      'accept': '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
    }
  };

  try {
    const response = await httpsRequest(options);
    if (response.statusCode === 200) {
      return response.data;
    } else {
      logger.error(`Domain check failed: ${response.statusCode}`);
      return null;
    }
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
    headers: {
      'accept': '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'content-type': 'application/json',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
    }
  };

  const data = {
    name: domainName,
    owner: ownerAddress,
    duration: 1,
    txHash: txHash
  };

  try {
    const response = await httpsRequest(options, data);
    if (response.statusCode === 200) {
      return response.data;
    } else {
      logger.error(`Domain registration API failed: ${response.statusCode}`);
      return null;
    }
  } catch (error) {
    logger.error(`Domain registration API error: ${error.message}`);
    return null;
  }
}
async function registerTrustDomain(intuitionWallet, domainName) {
  const ethers = await E();
  const provider = intuitionWallet.provider;

  const net = await provider.getNetwork();
  if (Number(net.chainId) !== NET.intuition.chainId) {
    logger.warn(`Connected chainId ${String(net.chainId)}; expected ${NET.intuition.chainId}. Check RPC.`);
  }

  const cleanDomainName = domainName.replace('.trust', '');

  logger.loading(`Checking availability of ${cleanDomainName}.trust...`);
  const availability = await checkDomainAvailability(cleanDomainName);
  
  if (!availability) {
    throw new Error("Failed to check domain availability");
  }
  
  if (!availability.available) {
    logger.error(`Domain ${availability.name} is not available!`);
    return null;
  }
  
  logger.info(`Domain ${availability.name} is available!`);
  logger.info(`Price: ${availability.pricing.pricePerYear} tTRUST per year`);
  logger.info(`Tier: ${availability.pricing.tier}`);

  const tnsContract = new ethers.Contract(TNS_CONTRACT_ADDR, TNS_ABI, intuitionWallet);

  const value = ethers.parseEther(availability.pricing.pricePerYear);
  const bal = await provider.getBalance(intuitionWallet.address);
  const feeParams = await getFeeParams(provider);

  let estGas;
  try {
    estGas = await tnsContract.register.estimateGas(cleanDomainName, 1, { value });
  } catch (e) {
    logger.error(`Gas estimation failed for domain registration: ${e.shortMessage || e.message || e}`);
    throw e;
  }

  const perGas = feeParams.maxFeePerGas ?? feeParams.gasPrice;
  const feeWei = perGas ? (estGas * perGas) : 0n;
  const required = value + feeWei;

  logger.info(`Balance: ${fmtEther(ethers, bal)} tTRUST`);
  logger.info(`Cost   : ${fmtEther(ethers, value)} tTRUST`);
  if (perGas) {
    logger.info(`Fee est: ~${fmtEther(ethers, feeWei)} tTRUST  (gas ${estGas} @ ${perGas} wei)`);
    logger.info(`Total  : ~${fmtEther(ethers, required)} tTRUST`);
  }

  if (perGas && bal < required) {
    const short = required - bal;
    logger.error(
      `Insufficient balance. Short by ~${fmtEther(ethers, short)} tTRUST. ` +
      `Need at least ~${fmtEther(ethers, required)} tTRUST total.`
    );
    throw new Error("Insufficient balance for domain registration");
  }

  logger.loading(`Registering ${cleanDomainName}.trust for ${intuitionWallet.address}...`);
  let overrides = { value };
  const { maxFeePerGas, maxPriorityFeePerGas } = feeParams;
  if (maxFeePerGas && maxPriorityFeePerGas) {
    overrides = { ...overrides, maxFeePerGas, maxPriorityFeePerGas };
  }

  const tx = await tnsContract.register(cleanDomainName, 1, overrides);
  logger.info(`Registration tx: ${tx.hash}`);

  const rec = await tx.wait();
  if (rec.status === 0) {
    logger.error("Domain registration transaction reverted.");
    throw new Error("Registration transaction failed");
  }

  const used = rec.gasUsed ?? 0n;
  const eff = rec.effectiveGasPrice ?? feeParams.gasPrice ?? 0n;
  const paid = used * eff;
  logger.info(`Gas used: ${used.toString()} | Fee (wei): ${paid.toString()}`);
  logger.success(`Domain registration transaction completed in block ${rec.blockNumber}`);

  logger.loading("Registering domain via TNS API...");
  const apiResult = await registerDomainAPI(cleanDomainName, intuitionWallet.address, tx.hash);
  
  if (apiResult && apiResult.message === "Domain registered successfully") {
    logger.success(`Domain ${apiResult.domain.name} registered successfully!`);
    logger.info(`Token ID: ${apiResult.domain.tokenId}`);
    logger.info(`Expires: ${new Date(apiResult.domain.expirationDate).toLocaleDateString()}`);
    return { txHash: tx.hash, domain: apiResult.domain };
  } else {
    logger.warn("Blockchain transaction succeeded but API registration may have failed");
    return { txHash: tx.hash, domain: null };
  }
}

async function bridgeBaseToIntuition(baseWallet, amountTTrust, destL2Address) {
  const ethers = await E();
  const provider = baseWallet.provider;

  const net = await provider.getNetwork();
  if (Number(net.chainId) !== NET.baseSepolia.chainId) {
    logger.warn(`Connected chainId ${String(net.chainId)}; expected ${NET.baseSepolia.chainId}. Check RPC.`);
  }

  const tTrustToken = new ethers.Contract(TTRUST_TOKEN_ADDR, TTRUST_ABI, baseWallet);
  const erc20Inbox = new ethers.Contract(ERC20_INBOX_ADDR, ERC20_INBOX_ABI, baseWallet);

  const value = ethers.parseEther(String(amountTTrust));
  const tokenBal = await tTrustToken.balanceOf(baseWallet.address);
  const ethBal = await provider.getBalance(baseWallet.address);

  logger.info(`tTRUST Balance: ${fmtEther(ethers, tokenBal)} tTRUST`);
  logger.info(`ETH Balance: ${fmtEther(ethers, ethBal)} ETH`);
  logger.info(`Amount: ${fmtEther(ethers, value)} tTRUST`);

  if (tokenBal < value) {
    const short = value - tokenBal;
    logger.error(`Insufficient tTRUST balance. Short by ${fmtEther(ethers, short)} tTRUST.`);
    throw new Error("Insufficient tTRUST balance");
  }

  const allowance = await tTrustToken.allowance(baseWallet.address, ERC20_INBOX_ADDR);
  if (allowance < value) {
    logger.loading("Approving tTRUST spending...");
    const approveTx = await tTrustToken.approve(ERC20_INBOX_ADDR, value);
    logger.info(`Approve tx: ${approveTx.hash}`);
    await approveTx.wait();
    logger.success("Approval completed");
  }

  const params = {
    to: destL2Address || baseWallet.address,
    l2CallValue: 10000000000000n,
    maxSubmissionCost: 0n, 
    excessFeeRefundAddress: baseWallet.address,
    callValueRefundAddress: baseWallet.address,
    gasLimit: 27514n, 
    maxFeePerGas: 600000000n, 
    tokenTotalFeeAmount: value,
    data: "0x"
  };

  const minBridgeAmount = (params.gasLimit * params.maxFeePerGas) + params.l2CallValue;
  if (value < minBridgeAmount) {
      logger.error(`Amount to bridge is too low. It must be at least ${fmtEther(ethers, minBridgeAmount)} tTRUST to cover L2 fees.`);
      throw new Error("Bridge amount is too low to cover L2 fees.");
  }

  const feeParams = await getFeeParams(provider);
  
  logger.loading(`Creating retryable ticket for ${amountTTrust} tTRUST bridge to Intuition...`);
  
  try {
    const estimatedGas = await erc20Inbox.createRetryableTicket.estimateGas(
        params.to,
        params.l2CallValue,
        params.maxSubmissionCost,
        params.excessFeeRefundAddress,
        params.callValueRefundAddress,
        params.gasLimit,
        params.maxFeePerGas,
        params.tokenTotalFeeAmount,
        params.data
    );
    logger.info(`Gas estimated successfully: ${estimatedGas.toString()}`);

    const tx = await erc20Inbox.createRetryableTicket(
      params.to,
      params.l2CallValue,
      params.maxSubmissionCost,
      params.excessFeeRefundAddress,
      params.callValueRefundAddress,
      params.gasLimit,
      params.maxFeePerGas,
      params.tokenTotalFeeAmount,
      params.data,
      {
        gasLimit: estimatedGas,
        maxFeePerGas: feeParams.maxFeePerGas ?? undefined,
        maxPriorityFeePerGas: feeParams.maxPriorityFeePerGas ?? undefined
      }
    );
    
    logger.info(`Bridge tx (Step 1 - Create Retryable Ticket): ${tx.hash}`);
    const rec = await tx.wait();
    
    if (rec.status === 0) {
      logger.error("Create retryable ticket transaction reverted.");
      throw new Error("Create retryable ticket failed");
    }

    const used = rec.gasUsed ?? 0n;
    const eff = rec.effectiveGasPrice ?? feeParams.gasPrice ?? 0n;
    const paid = used * eff;
    logger.info(`Gas used: ${used.toString()} | Fee (ETH): ${fmtEther(ethers, paid)}`);
    logger.success(`Retryable ticket created in block ${rec.blockNumber}`);
    
    logger.info("Bridging from L1 to L2 is now initiated. The funds will arrive on Intuition automatically.");
    
    return { 
      txHash: tx.hash, 
      blockNumber: rec.blockNumber,
      status: 'retryable_ticket_created',
      message: 'Bridge initiated. Finalization will happen automatically.'
    };
  } catch (e) {
    logger.error(`Bridge failed: ${e.shortMessage || e.message || e}`);
    throw e;
  }
}
async function withdrawFromIntuition(intuitionWallet, amountEth, destL1Address) {
  const ethers = await E();
  const provider = intuitionWallet.provider;

  const net = await provider.getNetwork();
  if (Number(net.chainId) !== NET.intuition.chainId) {
    logger.warn(`Connected chainId ${String(net.chainId)}; expected ${NET.intuition.chainId}. Check RPC.`);
  }

  const arbSys = new ethers.Contract(ARBSYS_ADDR, ARBSYS_ABI, intuitionWallet);

  const value = ethers.parseEther(String(amountEth));
  const bal = await provider.getBalance(intuitionWallet.address);
  const feeParams = await getFeeParams(provider);

  logger.info(`L2 Balance: ${fmtEther(ethers, bal)} tTRUST`);
  logger.info(`Amount    : ${fmtEther(ethers, value)} tTRUST`);

  let estGas;
  try {
    estGas = await arbSys.withdrawEth.estimateGas(destL1Address, { value });
  } catch (e) {
    logger.error(`Gas estimation failed for withdrawEth: ${e.shortMessage || e.message || e}`);
    throw e;
  }

  const perGas = feeParams.maxFeePerGas ?? feeParams.gasPrice;
  const feeWei = perGas ? (estGas * perGas) : 0n;
  const required = value + feeWei;

  if (perGas) {
    logger.info(`Fee est   : ~${fmtEther(ethers, feeWei)} tTRUST (gas ${estGas} @ ${perGas} wei)`);
    logger.info(`Total     : ~${fmtEther(ethers, required)} tTRUST`);
  }

  if (bal < required) {
    const short = required - bal;
    logger.error(
      `Insufficient balance. Short by ~${fmtEther(ethers, short)} tTRUST. ` +
      `Need at least ~${fmtEther(ethers, required)} tTRUST total.`
    );
    throw new Error("Insufficient balance for withdrawal amount + gas");
  }

  logger.loading(`L2→L1 withdrawal ${amountEth} tTRUST from ${intuitionWallet.address} → ${destL1Address}`);
  
  let overrides = { value };
  const { maxFeePerGas, maxPriorityFeePerGas } = feeParams;
  if (maxFeePerGas && maxPriorityFeePerGas) {
    overrides = { ...overrides, maxFeePerGas, maxPriorityFeePerGas };
  }

  const tx = await arbSys.withdrawEth(destL1Address, overrides);
  logger.info(`Withdrawal tx (L2): ${tx.hash}`);
  const rec = await tx.wait();

  if (rec.status === 0) {
    logger.error("Withdrawal transaction reverted.");
    throw new Error("Withdrawal transaction failed");
  }

  const used = rec.gasUsed ?? 0n;
  const eff = rec.effectiveGasPrice ?? feeParams.gasPrice ?? 0n;
  const paid = used * eff;
  logger.info(`Gas used: ${used.toString()} | Fee (wei): ${paid.toString()}`);
  logger.success(`Withdrawal submitted on L2, block ${rec.blockNumber}.`);
  
  return { txHash: tx.hash };
}
async function finalizeBridgeToBase(baseWallet, l2TxHash) {
    const ethers = await E();
    const l1Provider = baseWallet.provider;
    const l2Provider = await provider(NET.intuition.rpc);
    
    logger.loading(`Finalizing withdrawal for L2 tx: ${l2TxHash}`);

    const l2Receipt = await l2Provider.getTransactionReceipt(l2TxHash);
    if (!l2Receipt) {
        throw new Error("Could not get L2 transaction receipt.");
    }
    logger.info("Got L2 transaction receipt.");

    const l2ToL1Log = l2Receipt.logs.find(log => log.topics[0] === "0x3e7aafa77dbf186b7fd488006beff893744caa3c4f6f299e8a709fa2087374fc");

    if (!l2ToL1Log) {
        throw new Error("Could not find the L2ToL1Tx log in the L2 receipt.");
    }

    const l2Block = l2Receipt.blockNumber;
    const index = ethers.dataSlice(l2ToL1Log.topics[3], 0);

    logger.info(`Withdrawal details found: Index ${index}, L2 Block ${l2Block}`);

    logger.loading("Waiting for the withdrawal to be ready for finalization on L1. This can take a few minutes...");
    await new Promise(resolve => setTimeout(resolve, 120000)); 

    logger.loading("Fetching withdrawal proof...");
    
    const proofResponse = await httpsRequest({
        hostname: 'testnet.bridge.intuition.systems',
        path: `/api/trpc/bridge.getWithdrawalProof?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%22l2ChainId%22%3A${NET.intuition.chainId}%2C%22l2BlockNumber%22%3A${Number(l2Block)}%2C%22l2ToL1MsgIndex%22%3A${parseInt(index, 16)}%7D%7D%7D`,
        method: 'GET'
    });

    const proofData = proofResponse.data[0]?.result?.data?.json;
    if (!proofData || !proofData.proof) {
        throw new Error("Failed to fetch withdrawal proof.");
    }

    const { proof, l2OutputIndex, outputRootProof } = proofData;
    const { l2Sender, to, l2Timestamp, value, data } = proofData.message;
    const l1Block = await l1Provider.getBlockNumber();

    logger.success("Successfully fetched withdrawal proof.");

    logger.loading("Executing the finalization transaction on L1...");
    const outboxContract = new ethers.Contract(ERC20_OUTBOX_ADDR, ERC20_OUTBOX_ABI, baseWallet);
    const tx = await outboxContract.executeTransaction(
        proof,
        index,
        l2Sender,
        to,
        l2Block,
        l1Block, 
        l2Timestamp,
        value,
        data
    );

    logger.info(`Finalization tx (L1): ${tx.hash}`);
    const rec = await tx.wait();

    if (rec.status === 0) {
        logger.error("Finalization transaction reverted.");
        throw new Error("Finalization transaction failed");
    }

    logger.success(`Withdrawal finalized successfully in L1 block ${rec.blockNumber}!`);
    return { txHash: tx.hash };
}

async function swapTTrustToIntuit(intuitionWallet, amountTTrust) {
  const ethers = await E();
  const provider = intuitionWallet.provider;

  const value = ethers.parseEther(String(amountTTrust));
  const bal = await provider.getBalance(intuitionWallet.address);
  const feeParams = await getFeeParams(provider);

  logger.info(`tTRUST Balance: ${fmtEther(ethers, bal)} tTRUST`);
  logger.info(`Swap Amount: ${amountTTrust} tTRUST`);

  let estGas;
  try {
    const data = SWAP_TTRUST_TO_INTUIT_METHOD_ID;
    estGas = await provider.estimateGas({
      to: SWAP_CONTRACT_ADDR,
      from: intuitionWallet.address,
      value: value,
      data: data
    });
  } catch (e) {
    logger.error(`Gas estimation failed for swap: ${e.shortMessage || e.message || e}`);
    throw e;
  }

  const perGas = feeParams.maxFeePerGas ?? feeParams.gasPrice;
  const feeWei = perGas ? (estGas * perGas) : 0n;
  const required = value + feeWei;

  if (perGas) {
    logger.info(`Estimated Fee: ~${fmtEther(ethers, feeWei)} tTRUST (gas ${estGas} @ ${perGas} wei)`);
    logger.info(`Total Cost: ~${fmtEther(ethers, required)} tTRUST`);
  }

  if (bal < required) {
    const short = required - bal;
    logger.error(
      `Insufficient balance. Short by ~${fmtEther(ethers, short)} tTRUST.`
    );
    throw new Error("Insufficient balance for swap");
  }

  logger.loading(`Swapping ${amountTTrust} tTRUST for INTUIT...`);

  const tx = await intuitionWallet.sendTransaction({
    to: SWAP_CONTRACT_ADDR,
    value: value,
    data: SWAP_TTRUST_TO_INTUIT_METHOD_ID,
    gasLimit: estGas,
    maxFeePerGas: feeParams.maxFeePerGas ?? undefined,
    maxPriorityFeePerGas: feeParams.maxPriorityFeePerGas ?? undefined
  });
  logger.info(`Swap tx: ${tx.hash}`);

  const rec = await tx.wait();
  if (rec.status === 0) {
    logger.error("Swap transaction reverted.");
    throw new Error("Swap transaction failed");
  }

  logger.success(`Swap transaction completed in block ${rec.blockNumber}.`);
  return { txHash: tx.hash };
}

async function swapIntuitToTTrust(intuitionWallet, amountIntuit) {
  const ethers = await E();
  const provider = intuitionWallet.provider;

  const value = ethers.parseEther(String(amountIntuit));
  const intuitContract = new ethers.Contract(INTUIT_TOKEN_ADDR, INTUIT_ABI, intuitionWallet);
  const intuitBalance = await intuitContract.balanceOf(intuitionWallet.address);
  const ttrustBalance = await provider.getBalance(intuitionWallet.address);

  logger.info(`INTUIT Balance: ${fmtEther(ethers, intuitBalance)} INTUIT`);
  logger.info(`tTRUST Balance (for gas): ${fmtEther(ethers, ttrustBalance)} tTRUST`);
  logger.info(`Swap Amount: ${amountIntuit} INTUIT`);

  if (intuitBalance < value) {
    const short = value - intuitBalance;
    logger.error(`Insufficient INTUIT balance. Short by ${fmtEther(ethers, short)} INTUIT.`);
    throw new Error("Insufficient INTUIT balance for swap");
  }

  const allowance = await intuitContract.allowance(intuitionWallet.address, SWAP_CONTRACT_ADDR);
  if (allowance < value) {
    logger.loading("Approving INTUIT spending...");
    const approveTx = await intuitContract.approve(SWAP_CONTRACT_ADDR, value);
    logger.info(`Approve tx: ${approveTx.hash}`);
    await approveTx.wait();
    logger.success("Approval completed");
  }

  const feeParams = await getFeeParams(provider);
  const data = ethers.concat([
    SWAP_INTUIT_TO_TTRUST_METHOD_ID,
    ethers.zeroPadValue(ethers.toBeHex(value), 32)
  ]);
 
  let estGas;
  try {
    estGas = await provider.estimateGas({
      to: SWAP_CONTRACT_ADDR,
      from: intuitionWallet.address,
      data: data
    });
  } catch (e) {
    logger.error(`Gas estimation failed for swap: ${e.shortMessage || e.message || e}`);
    throw e;
  }

  const perGas = feeParams.maxFeePerGas ?? feeParams.gasPrice;
  const feeWei = perGas ? (estGas * perGas) : 0n;

  if (ttrustBalance < feeWei) {
    const short = feeWei - ttrustBalance;
    logger.error(`Insufficient tTRUST for gas. Short by ~${fmtEther(ethers, short)} tTRUST.`);
    throw new Error("Insufficient balance for gas");
  }

  logger.loading(`Swapping ${amountIntuit} INTUIT for tTRUST...`);

  const tx = await intuitionWallet.sendTransaction({
    to: SWAP_CONTRACT_ADDR,
    value: 0,
    data: data,
    gasLimit: estGas,
    maxFeePerGas: feeParams.maxFeePerGas ?? undefined,
    maxPriorityFeePerGas: feeParams.maxPriorityFeePerGas ?? undefined
  });
  logger.info(`Swap tx: ${tx.hash}`);

  const rec = await tx.wait();
  if (rec.status === 0) {
    logger.error("Swap transaction reverted.");
    throw new Error("Swap transaction failed");
  }

  logger.success(`Swap transaction completed in block ${rec.blockNumber}.`);
  return { txHash: tx.hash };
}

async function rollDice(intuitionWallet, amountTTrust) {
  const ethers = await E();
  const provider = intuitionWallet.provider;

  const value = ethers.parseEther(String(amountTTrust));
  const bal = await provider.getBalance(intuitionWallet.address);
  const feeParams = await getFeeParams(provider);

  logger.info(`tTRUST Balance: ${fmtEther(ethers, bal)} tTRUST`);
  logger.info(`Bet Amount: ${amountTTrust} tTRUST`);

  let estGas;
  try {
    estGas = await provider.estimateGas({
      to: DICE_CONTRACT_ADDR,
      from: intuitionWallet.address,
      value: value,
      data: DICE_ROLL_METHOD_ID
    });
  } catch (e) {
    logger.error(`Gas estimation failed for dice roll: ${e.shortMessage || e.message || e}`);
    throw e;
  }

  const perGas = feeParams.maxFeePerGas ?? feeParams.gasPrice;
  const feeWei = perGas ? (estGas * perGas) : 0n;
  const required = value + feeWei;

  if (perGas) {
    logger.info(`Estimated Fee: ~${fmtEther(ethers, feeWei)} tTRUST (gas ${estGas} @ ${perGas} wei)`);
    logger.info(`Total Cost: ~${fmtEther(ethers, required)} tTRUST`);
  }

  if (bal < required) {
    const short = required - bal;
    logger.error(
      `Insufficient balance. Short by ~${fmtEther(ethers, short)} tTRUST.`
    );
    throw new Error("Insufficient balance for dice roll");
  }

  logger.loading(`Rolling the dice with a bet of ${amountTTrust} tTRUST...`);

  const tx = await intuitionWallet.sendTransaction({
    to: DICE_CONTRACT_ADDR,
    value: value,
    data: DICE_ROLL_METHOD_ID,
    gasLimit: estGas,
    maxFeePerGas: feeParams.maxFeePerGas ?? undefined,
    maxPriorityFeePerGas: feeParams.maxPriorityFeePerGas ?? undefined
  });
  logger.info(`Dice Roll tx: ${tx.hash}`);

  const rec = await tx.wait();
  if (rec.status === 0) {
    logger.error("Dice roll transaction reverted.");
    throw new Error("Dice roll transaction failed");
  }

  logger.success(`Dice roll transaction completed in block ${rec.blockNumber}.`);
  return { txHash: tx.hash };
}

async function runAutomatedSequence(walIntuition, walBase) {
    const ethers = await E();
    for (let i = 0; i < walIntuition.length; i++) {
        const wL2 = walIntuition[i];
        const wL1 = walBase[i];
        logger.section(`Memproses Dompet ${i + 1}/${walIntuition.length}: ${wL1.address}`);

        // Tugas 1: Bridge Base -> Intuition
        // Jika bridge gagal, kita lanjut ke dompet berikutnya karena tugas lain tidak akan bisa dijalankan.
        try {
            logger.step(`Tugas 1: Bridge ${AUTO_CONFIG.DEPOSIT_AMOUNT} tTRUST ke Intuition`);
            await bridgeBaseToIntuition(wL1, AUTO_CONFIG.DEPOSIT_AMOUNT, wL2.address);
            logger.success(`Bridge berhasil dimulai. Menunggu ${AUTO_CONFIG.DELAY_AFTER_BRIDGE_MS / 1000} detik agar dana tiba...`);
            await new Promise(res => setTimeout(res, AUTO_CONFIG.DELAY_AFTER_BRIDGE_MS));
        } catch (e) {
            logger.error(`Gagal pada Tugas 1 (Bridge): ${e.message}. Melanjutkan ke dompet berikutnya.`);
            continue; // Lanjut ke dompet berikutnya jika bridge gagal
        }

        // Tugas 2: Swap tTRUST -> INTUIT
        // Jika gagal, catat error dan lanjut ke tugas berikutnya untuk dompet ini.
        try {
            logger.step(`Tugas 2: Swap ${AUTO_CONFIG.SWAP_TTRUST_AMOUNT} tTRUST ke INTUIT`);
            await swapTTrustToIntuit(wL2, AUTO_CONFIG.SWAP_TTRUST_AMOUNT);
            logger.success('Swap tTRUST ke INTUIT berhasil.');
            await new Promise(res => setTimeout(res, AUTO_CONFIG.DELAY_BETWEEN_TASKS_MS));
        } catch (e) {
            logger.error(`Gagal pada Tugas 2 (Swap tTRUST): ${e.message}. Melanjutkan ke tugas berikutnya.`);
        }
        
        // Tugas 3: Dice Roll
        // Jika gagal, catat error dan lanjut ke tugas berikutnya untuk dompet ini.
        try {
            logger.step(`Tugas 3: Roll Dice dengan ${AUTO_CONFIG.DICE_BET_AMOUNT} tTRUST`);
            await rollDice(wL2, AUTO_CONFIG.DICE_BET_AMOUNT);
            logger.success('Roll Dice berhasil.');
            await new Promise(res => setTimeout(res, AUTO_CONFIG.DELAY_BETWEEN_TASKS_MS));
        } catch (e) {
            logger.error(`Gagal pada Tugas 3 (Dice Roll): ${e.message}. Melanjutkan ke tugas berikutnya.`);
        }

        // Tugas 4: Swap INTUIT -> tTRUST (Jumlah dinamis)
        // Jika gagal, catat error dan lanjut ke tugas berikutnya untuk dompet ini.
        try {
            const intuitContract = new ethers.Contract(INTUIT_TOKEN_ADDR, INTUIT_ABI, wL2);
            const intuitBalance = await intuitContract.balanceOf(wL2.address);
            logger.info(`Saldo INTUIT saat ini: ${fmtEther(ethers, intuitBalance)}`);

            if (intuitBalance > 0n) {
                const amountToSwap = fmtEther(ethers, intuitBalance);
                logger.step(`Tugas 4: Swap semua ${amountToSwap} INTUIT ke tTRUST`);
                await swapIntuitToTTrust(wL2, amountToSwap);
                logger.success('Swap INTUIT ke tTRUST berhasil.');
                await new Promise(res => setTimeout(res, AUTO_CONFIG.DELAY_BETWEEN_TASKS_MS));
            } else {
                logger.warn("Melewati swap INTUIT: Saldo INTUIT adalah 0.");
            }
        } catch (e) {
            logger.error(`Gagal pada Tugas 4 (Swap INTUIT): ${e.message}. Melanjutkan ke tugas berikutnya.`);
        }

        // Tugas 5: Withdraw Intuition -> Base
        // Jika gagal, catat error. Ini adalah tugas terakhir untuk dompet ini.
        try {
            const l2Balance = await wL2.provider.getBalance(wL2.address);
            const withdrawAmountWei = ethers.parseEther(AUTO_CONFIG.WITHDRAW_AMOUNT);
            logger.info(`Saldo Intuition (tTRUST) saat ini: ${fmtEther(ethers, l2Balance)}`);

            if (l2Balance > withdrawAmountWei) {
                logger.step(`Tugas 5: Withdraw ${AUTO_CONFIG.WITHDRAW_AMOUNT} tTRUST dari Intuition`);
                const withdrawRes = await withdrawFromIntuition(wL2, AUTO_CONFIG.WITHDRAW_AMOUNT, wL1.address);
                logger.success(`Withdrawal berhasil dimulai. Tx: ${withdrawRes.txHash}`);
                await finalizeBridgeToBase(wL1, withdrawRes.txHash);
            } else {
                logger.warn(`Melewati withdrawal: Saldo tidak cukup. Memiliki ${fmtEther(ethers, l2Balance)}, butuh > ${AUTO_CONFIG.WITHDRAW_AMOUNT}`);
            }
        } catch (e) {
            logger.error(`Gagal pada Tugas 5 (Withdraw): ${e.message}.`);
        }
        
        if (i < walIntuition.length - 1) {
            logger.info(`Dompet ${i + 1} selesai. Menunggu ${AUTO_CONFIG.DELAY_BETWEEN_WALLETS_MS / 1000} detik sebelum lanjut ke dompet berikutnya...`);
            await new Promise(res => setTimeout(res, AUTO_CONFIG.DELAY_BETWEEN_WALLETS_MS));
        }
    }
}

(async function main () {
  let rl = null;
  try {
    rl = rlOpen();
    logger.banner();

    const pks = loadPrivateKeys();
    if (pks.length === 0) {
      logger.error("Tidak ada PRIVATE_KEY_* ditemukan di .env (contoh, PRIVATE_KEY_1=...).");
      process.exit(1);
    }
    logger.info(`Memuat ${pks.length} dompet.`);
    pks.forEach((_, i) => logger.info(`PRIVATE_KEY_${i+1} dimuat`));
    console.log();

    const provIntuition = await provider(NET.intuition.rpc);
    const provBase      = await provider(NET.baseSepolia.rpc);

    const walIntuition = await Promise.all(pks.map(pk => wallet(pk, provIntuition)));
    const walBase      = await Promise.all(pks.map(pk => wallet(pk, provBase)));

    console.log("Pilih Tindakan Anda:");
    console.log("1) Jalankan Urutan Tugas Otomatis (Berulang setiap 24 jam)");
    console.log("2) Daftarkan Domain .trust (Tugas Manual)");
    console.log();
    const choice = (await ask(rl, "Masukkan pilihan (1-2): ")).trim();

    if (choice === '1') {
        rl.close();
        rl = null;

        while (true) {
            logger.summary("Memulai urutan tugas otomatis...");
            await runAutomatedSequence(walIntuition, walBase);
            logger.summary("Urutan tugas otomatis selesai.");

            const twentyFourHoursInMs = 24 * 60 * 60 * 1000;
            logger.info("Semua dompet telah diproses. Menunggu 24 jam untuk proses berikutnya...");

            let remaining = twentyFourHoursInMs;
            while (remaining > 0) {
                const hours = Math.floor(remaining / (1000 * 60 * 60));
                const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
                logger.countdown(`Proses berikutnya dalam: ${hours} jam ${minutes} menit ${seconds} detik `);
                await new Promise(resolve => setTimeout(resolve, 1000));
                remaining -= 1000;
            }
            console.log(); 
        }

    } else if (choice === '2') {
        const domainName = (await ask(rl, "Masukkan nama domain (tanpa .trust): ")).trim();
        if (!domainName) {
            logger.error("Nama domain wajib diisi.");
            process.exit(1);
        }
        
        console.log();
        logger.info(`Akan mendaftarkan ${domainName}.trust untuk ${walIntuition.length} dompet`);
        console.log();

        for (let i = 0; i < walIntuition.length; i++) {
            const wL2 = walIntuition[i];
            logger.step(`(${i+1}/${walIntuition.length}) Mendaftarkan ${domainName}.trust untuk: ${wL2.address}`);
            try {
                const currentDomainName = domainName + (i > 0 ? i : '');
                const result = await registerTrustDomain(wL2, currentDomainName);
                if (result && result.domain) {
                    logger.success(`Domain terdaftar: ${result.domain.name} | Token ID: ${result.domain.tokenId}`);
                }
            } catch (e) {
                logger.error(`Pendaftaran domain gagal untuk ${wL2.address}: ${e.message || e}`);
            }
            console.log();
        }
        logger.success("Pendaftaran domain selesai.");
    } else {
        logger.error("Pilihan tidak valid.");
    }
  } catch (e) {
    logger.error(e.message || String(e));
    process.exitCode = 1;
  } finally {
    if (rl && !rl.closed) {
      try { rl.close(); } catch {}
    }
  }
})();
