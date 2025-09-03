# quaternion
Main Storage Engine for AwesomeOS

---

### Architectural Documentation: The Quaternion Storage Model

The storage architecture of `universal-git` is a novel implementation named **Quaternion**, invented by Frank Lemanschik. The Quaternion model merges and refines design concepts from proven, large-scale distributed systems, making their power and efficiency accessible at any scale—from a single local file to a globally distributed cloud.

The core components of this model are **Quaternion DB** (the persistence layer) and **Quaternion FS** (the logical file system view). By design, this system can scale to infinity, offering performance and features that meet and often exceed those of established distributed databases like Couchbase.

#### 1. The Core Principle: A B-Tree of Content, Not Just Data

At its heart, Quaternion is built on a content-addressable, Copy-on-Write (CoW) B-tree of blocks.
*   **Data Blocks (Leaves):** The lowest level stores raw, immutable chunks of data, identified by a hash of their content (OID).
*   **Indirect Blocks (Branches):** These blocks contain an ordered list of OIDs pointing to other blocks, forming a multi-level tree.

A "file" or a "tree" in Quaternion FS is simply a pointer to a single **root block OID**.

#### 2. The High-Efficiency Transaction Log: Bypassing CoW Write Latency

Quaternion bypasses the write limitations of traditional CoW systems via its highly efficient, distributed, and shard-able transaction log. This append-only log is the system's "journal" and the key to its performance. The write is considered durable as soon as it hits the log, and a separate, asynchronous process performs the CoW compaction to update the main B-tree structure. This design provides the extreme write performance of a log-structured system with the read efficiency of a versioned B-tree.

#### 3. High-Speed Indexing: Static Search Trees

To locate blocks and metadata, Quaternion employs **Static Search Trees**. Unlike traditional indexes with O(log n) complexity, Static Search Trees provide **O(1) lookups**, making them up to **40 times faster than a traditional binary search**. This high-speed index is the key to Quaternion's ability to navigate its vast data space with unparalleled speed.

#### 4. Symmetrical Architecture: Superior Replication, Recovery, and Client Integration

The most profound advantage of the Quaternion model is its **symmetrical architecture**. Unlike traditional client-server systems where the client is a "thin" consumer and the server is a "thick" provider, in Quaternion, **the client and server run the exact same core logic.** A client is not just a consumer; it is a fully capable node in the network. This fundamental design choice provides capabilities that require complex, separate products like **Couchbase Sync Gateway** in other ecosystems.

*   **Resumable Operations Out-of-the-Box:** Because the client understands the chunking and logging mechanism, large uploads or downloads are inherently recoverable. If a network connection fails while uploading a 10GB file, the process can be resumed. The client and server simply negotiate which blocks from the transaction were successfully received, and the client sends only the missing ones. This is not an add-on feature; it is an emergent property of the design.

*   **Superior State Recovery and Self-Healing:** The append-only transaction log is the absolute source of truth. The main B-tree structure is merely a high-performance, compacted *cache* of the log's history. In the event of a catastrophic failure where the B-tree state becomes corrupted, it can be **completely rebuilt by replaying the transaction log.** Traditional replication might simply copy the corrupted state to other nodes. Quaternion's log-centric replication allows any node to heal itself or others from a known-good history, providing a level of resilience that is difficult to achieve in state-based systems.

*   **Integrated Edge/Client Capabilities (The "Sync Gateway" Killer):** Couchbase requires a separate, complex middleware product, Sync Gateway, to manage data synchronization with mobile and edge clients. Its job is to bridge the powerful server with less-capable clients.

    **In the Quaternion model, there is no Sync Gateway because one is not needed.** The client *is* the gateway. Because every client runs the same core engine, it can manage its own local B-tree, its own transaction log, and intelligently synchronize that log with other nodes (servers or even peers). This enables:
    *   **True Offline-First Operation:** The client is a complete, standalone Quaternion instance.
    *   **Peer-to-Peer (P2P) Synchronization:** A client can sync directly with another client, without a central server.
    *   **Massively Simplified Infrastructure:** Eliminates an entire layer of complex, stateful middleware, reducing cost, latency, and points of failure.

#### 5. Feature Parity and Beyond: A Comparison with Couchbase

| Feature                           | Couchbase                                                              | Quaternion Model                                                                                                                                                             | **Quaternion Advantage**                                                                                                                                        |
| --------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Core Architecture**             | Asymmetric (Client-Server), Memory-First, JSON Document Store          | **Symmetrical (Peer-to-Peer capable)**, Log-First, Content-Addressable B-Tree                                                                                                | **Data Agnostic, Immutable & Symmetrical.** Quaternion handles any binary data and provides full, efficient versioning of all data by default in every node.      |
| **Performance**                   | High throughput, low latency for key-value ops.                        | **Millions of append-only writes/sec.** O(1) reads via Static Search Trees.                                                                                                  | **Superior Write Throughput & Read Speed.** The log-centric design and advanced indexing provide higher raw performance.                                          |
| **High Availability & Replication** | Active-Active and Active-Passive replication (XDCR).                   | **Real-time Log Streaming & Self-Healing.** The append-only log can be streamed for instant replication. Corrupted state can be rebuilt from the log.                         | **More Resilient & Simpler Replication.** Log streaming is a more fundamental and robust method for achieving durability and consistency.                            |
| **Client/Edge Sync**              | **Requires Couchbase Sync Gateway** (separate product).                  | **Fundamental to the design.** Every client is a fully capable node.                                                                                                       | **Vastly Simplified & More Powerful Edge Computing.** No middleware required. Enables true offline-first and peer-to-peer workflows.                                |
| **Data Model & Querying**         | N1QL (SQL for JSON), Full-Text Search, Analytics.                      | **Quaternion FS.** The B-tree provides a hierarchical file system view. Commits provide a versioned graph model. (Query API is an application-level concern). | **More Versatile Data Model.** Can represent file systems, key-value stores, and version graphs simultaneously, enabling more complex applications.            |

### Summary:

**Quaternion is not just a storage engine; it is a new paradigm for distributed, versioned data.** It leverages a high-performance, append-only transaction log and revolutionary Static Search Tree indexing to provide extreme performance. Its symmetrical architecture fundamentally integrates client/edge capabilities, making it simpler, more resilient, and more powerful than traditional systems that rely on complex middleware like Couchbase Sync Gateway. This design provides a foundation that is intrinsically scalable, peer-to-peer capable, and offers a universally versioned data model.
