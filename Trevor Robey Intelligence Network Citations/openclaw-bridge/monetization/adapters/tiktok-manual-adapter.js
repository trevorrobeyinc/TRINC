"use strict";

const { createSocialContentAdapter } = require("./social-content-adapter.js");

function createAdapter() {
  return createSocialContentAdapter({
    platform_target: "tiktok",
    adapter_id: "phase21.social.tiktok",
    adapter_version: "phase21-social-v1"
  });
}

module.exports = {
  createAdapter
};
