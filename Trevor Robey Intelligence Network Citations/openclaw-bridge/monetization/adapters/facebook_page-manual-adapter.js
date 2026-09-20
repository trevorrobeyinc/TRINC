"use strict";

const { createSocialContentAdapter } = require("./social-content-adapter.js");

function createAdapter() {
  return createSocialContentAdapter({
    platform_target: "facebook_page",
    adapter_id: "phase21.social.facebook_page",
    adapter_version: "phase21-social-v1"
  });
}

module.exports = {
  createAdapter
};
