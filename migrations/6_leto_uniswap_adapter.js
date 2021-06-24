const LetoUniswapAdapter = artifacts.require("LetoUniswapAdapter");

module.exports = async function (deployer) {
	deployer.deploy(LetoUniswapAdapter);
};
