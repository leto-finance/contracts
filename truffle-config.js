const HDWalletProvider = require("@truffle/hdwallet-provider");

const privateKeys = process.env.PRIVATE_KEYS || "";

module.exports = {
  networks: {
    kovan: {
      provider: function(){
        return new HDWalletProvider(
          privateKeys.split(','),
          `https://kovan.infura.io/v3/${process.env.INFURA_API_KEY}`
        )
      },
      gas: 5000000,
      gasPrice: 25000000000,
			network_id: 42,
			networkCheckTimeout: 10000,
    },
		mainfork: {
      host: "localhost",
      port: 8545,
			network_id: 1,
    }
  },
  compilers: {
    solc: {
      version: "0.8.4",
      settings: {
       optimizer: {
         enabled: true,
         runs: 200
       },
       evmVersion: "istanbul"
      }
    }
  },
  db: {
    enabled: false
  }
};
