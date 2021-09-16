const LetoRegistry = artifacts.require("LetoRegistry");
const LetoLongStrategyAdapter = artifacts.require("LetoLongStrategyAdapter");

module.exports = function (deployer) {
	deployer.then(async () => {
		letoRegistry = await LetoRegistry.deployed()
		letoRegistry.setAddress("Aave:interest_bearing:USDC", "0xBcca60bB61934080951369a648Fb03DF4F96263C");
		letoRegistry.setAddress("Aave:debt_bearing:stable:USDC", "0xE4922afAB0BbaDd8ab2a88E0C79d884Ad337fcA6");
		return deployer.deploy(LetoLongStrategyAdapter, letoRegistry.address);
	})
};
