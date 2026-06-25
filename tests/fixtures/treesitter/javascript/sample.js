// Baseline fixture for tree-sitter JavaScript parsing.
// Covers: class + async method, ESM import, CommonJS export.

import { foo } from "bar";

export class UserService {
  async findById(id) {
    return foo(id);
  }

  create(user) {
    return { id: 1, ...user };
  }
}

module.exports.createUser = (u) => ({ id: 1, ...u });