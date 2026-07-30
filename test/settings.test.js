import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "../shared/constants.js";
import { getSettings, setSettings } from "../shared/settings.js";

test("settings prefer browser sync storage when it is available", async (context) => {
  context.after(() => {
    delete globalThis.chrome;
  });
  globalThis.chrome = {
    storage: {
      sync: {
        async get() {
          return { format: "jpeg", keepHistory: 25 };
        },
        async set(values) {
          assert.deepEqual(values, { format: "jpeg" });
        }
      },
      local: {
        async get() {
          assert.fail("local storage should not be read when sync succeeds");
        },
        async set() {
          assert.fail("local storage should not be written when sync succeeds");
        }
      }
    }
  };

  const settings = await getSettings();
  assert.equal(settings.format, "jpeg");
  assert.equal(settings.keepHistory, 25);
  assert.equal(settings.theme, DEFAULT_SETTINGS.theme);
  await setSettings({ format: "jpeg", unsupported: true });
});

test("settings fall back to local storage when sync is unsupported", async (context) => {
  context.after(() => {
    delete globalThis.chrome;
  });
  let localValues = { format: "png", keepHistory: 10 };
  globalThis.chrome = {
    storage: {
      sync: {
        async get() {
          throw new Error("storage.sync unsupported");
        },
        async set() {
          throw new Error("storage.sync unsupported");
        }
      },
      local: {
        async get() {
          return localValues;
        },
        async set(values) {
          localValues = { ...localValues, ...values };
        }
      }
    }
  };

  assert.equal((await getSettings()).format, "png");
  const updated = await setSettings({ format: "jpeg", unsupported: true });
  assert.equal(updated.format, "jpeg");
  assert.equal("unsupported" in updated, false);
});
