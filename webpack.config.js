
const path = require('path');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: {
    "gcode-viewer": './src/index.ts',
    'gcode-viewer.min': './src/index.ts',
  },
  output: {
    path: path.resolve(__dirname, '_bundles'),
    filename: '[name].js',
    libraryTarget: 'umd',
    library: 'gcodeViewer',
    umdNamedDefine: true
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  devtool: 'source-map',
  optimization: {
    minimizer: [
      new UglifyJsPlugin({
        sourceMap: true,
        include: /\.min\.js$/,
      })
    ]
  },
  module: {
    rules: [
      // {
      //   test: /\.worker\.ts$/,
      //   loader: 'worker-loader',
      // },
      {
        test: /\.tsx?$/,
        loader: 'ts-loader',
      },
    ]
  },
}

