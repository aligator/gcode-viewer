const path = require("path");
const UglifyJsPlugin = require("uglifyjs-webpack-plugin");

const mode = process.env.NODE_ENV || "development";

console.log("building for ", mode);

module.exports = {
  mode,
  entry: {
    "gcode-viewer": "./src/index.ts",
    "gcode-viewer.min": "./src/index.ts",
  },
  output: {
    path: path.resolve(__dirname, "_bundles"),
    filename: "[name].js",
    libraryTarget: "umd",
    library: "gcodeViewer",
    umdNamedDefine: true,
  },
  resolve: {
    alias: {
      three: path.resolve("./node_modules/three"),
    },
    extensions: [".ts", ".js"],
  },
  devtool: "source-map",
  optimization: {
    minimizer: [
      new UglifyJsPlugin({
        sourceMap: true,
        include: /\.min\.js$/,
      }),
    ],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: "ts-loader",
      },
    ],
  },
};
