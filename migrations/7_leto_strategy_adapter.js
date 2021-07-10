const LetoRegistry = artifacts.require("LetoRegistry");
const LetoLongStrategyAdapter = artifacts.require("LetoLongStrategyAdapter");

module.exports = function (deployer) {
	deployer.then(async () => {
		letoRegistry = await LetoRegistry.deployed()
		letoRegistry.setAddress("Aave:debt_bearing:stable:USDC", "0xE4922afAB0BbaDd8ab2a88E0C79d884Ad337fcA6");
		return deployer.deploy(LetoLongStrategyAdapter, letoRegistry.address);
	})
};
