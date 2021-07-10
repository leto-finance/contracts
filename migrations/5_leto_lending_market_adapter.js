const LetoRegistry = artifacts.require("LetoRegistry");
const LetoAaveAdapter = artifacts.require("LetoAaveAdapter");

module.exports = function (deployer) {
	deployer.then(async () => {
		letoRegistry = await LetoRegistry.deployed()
		letoRegistry.setAddress("Aave:LendingPool", "0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9");
		return deployer.deploy(LetoAaveAdapter, letoRegistry.address);
	})
};
