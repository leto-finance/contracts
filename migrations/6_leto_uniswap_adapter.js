const LetoRegistry = artifacts.require("LetoRegistry");
const LetoUniswapAdapter = artifacts.require("LetoUniswapAdapter");

module.exports = function (deployer) {
	deployer.then(async () => {
		letoRegistry = await LetoRegistry.deployed()
		letoRegistry.setAddress("Uniswap:Router", "0xE592427A0AEce92De3Edee1F18E0157C05861564");
		return deployer.deploy(LetoUniswapAdapter, letoRegistry.address);
	})
};

