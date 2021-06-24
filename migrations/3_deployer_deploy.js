const LetoRegistry = artifacts.require("LetoRegistry");
const LetoDeployer = artifacts.require("LetoDeployer");

module.exports = function (deployer) {
	deployer.then(async () => {
		letoRegistry = await LetoRegistry.deployed()
		return deployer.deploy(LetoDeployer, letoRegistry.address);
	})
};
