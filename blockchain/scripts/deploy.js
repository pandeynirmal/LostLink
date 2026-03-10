const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const LostAndFound = await hre.ethers.getContractFactory("LostAndFound");
    const lostAndFound = await LostAndFound.deploy();

    await lostAndFound.waitForDeployment();

    const address = await lostAndFound.getAddress();
    console.log(`LostAndFound deployed to ${address}`);

    // Save the address and ABI to a file for the backend to use
    const artifact = await hre.artifacts.readArtifact("LostAndFound");
    const contractData = {
        address: address,
        abi: artifact.abi
    };

    // Save to root for backend
    const rootPath = path.join(__dirname, "../../contract_data.json");
    fs.writeFileSync(rootPath, JSON.stringify(contractData, null, 2));
    
    // Save to public for frontend
    const publicPath = path.join(__dirname, "../../public/contract_data.json");
    fs.writeFileSync(publicPath, JSON.stringify(contractData, null, 2));
    
    console.log(`Contract data saved to: \n 1. ${rootPath} \n 2. ${publicPath}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
