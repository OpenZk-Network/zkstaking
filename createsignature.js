require("dotenv").config();
const { ethers } = require("ethers");

async function createDelegationSignature(
  operatorAddress,
  expiryTimestamp,
  salt,
  privateKey,
) {
  const wallet = new ethers.Wallet(privateKey);

  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const delegationHash = ethers.keccak256(
    abiCoder.encode(
      ["address", "uint256", "bytes32"],
      [operatorAddress, expiryTimestamp, salt],
    ),
  );

  const signature = await wallet.signMessage(ethers.getBytes(delegationHash));

  return signature;
}

async function main() {
  // Check if private key exists in environment variables
  if (!process.env.PK) {
    throw new Error(
      "Private key not found in environment variables. Please set PK in your .env file",
    );
  }

  const operatorAddress = "0x5b9b3cf0202a1a3dc8f527257b7e6002d23d8c85";
  const expiryTimestamp = Math.floor(Date.now() / 1000) + 86400; // 24 hours from now
  const salt = ethers.randomBytes(32);

  try {
    const signature = await createDelegationSignature(
      operatorAddress,
      expiryTimestamp,
      salt,
      process.env.PK,
    );

    console.log("Signature:", signature);
    console.log("Expiry:", expiryTimestamp);
    console.log("Salt:", ethers.hexlify(salt));
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
