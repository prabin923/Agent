const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = {
  entry: "./src/index.jsx",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "index.js",
    clean: true,
  },
  resolve: {
    extensions: [".js", ".jsx"],
  },
  module: {
    rules: [
      {
        oneOf: [
          {
            test: /\.jsx$/,
            include: path.resolve(__dirname, "src/scripts"),
            type: "asset/source",
          },
          {
            test: /\.jsx$/,
            use: "babel-loader",
          },
        ],
      },
    ],
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: "manifest.json", to: "." },
        { from: "index.html", to: "." },
      ],
    }),
  ],
  externals: {
    uxp: "commonjs2 uxp",
    premierepro: "commonjs2 premierepro",
    aftereffects: "commonjs2 aftereffects",
  },
  devtool: false,
};
