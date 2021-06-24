const LetoRegistry = artifacts.require("LetoRegistry");

module.exports = function (deployer) {
	deployer.deploy(LetoRegistry);
};
