'use strict';

module.exports = {
  entry: [
    './src/index.ts',
  ],
  module: {
    loaders: [
      {
        test: /\.jsx?$/,
        loaders: ['babel', 'eslint-loader'],
      },
      {
        test: /\.tsx?$/,
        loaders: [
          'babel', 'awesome-typescript-loader', 'tslint',
        ],
      },
    ]
  },
  output: {
    library: 'Saga',
    libraryTarget: 'umd'
  },
  resolve: {
    extensions: ['', '.ts', '.js'],
  },
  tslint: {
    emitErrors: true,
    failOnHint: false
  },
  eslint: {
    configFile: '.eslintrc'
  },
};

