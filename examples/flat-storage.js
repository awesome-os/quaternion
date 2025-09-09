const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
class ConsistentHash {
    constructor(options) {
        this._nodes = new Array();
        this._nodeKeys = new Array();
        this._keyMap = {};
        this._keys = null;
        this._needKeyMap = false;
        this.nodeCount = 0;
        this.keyCount = 0;

        options = options || {};
        if (options.range) this._range = options.range;
        if (options.controlPoints || options.weight) this._weightDefault = options.controlPoints || options.weight;
        if (options.distribution === 'uniform') this._uniform = true;
        if (options.orderNodes) this._orderNodes = options.orderNodes;
        if (Array.isArray(options.nodes)) this._addNodesArray(options.nodes);
    }

    _nodes = null;
    _nodeKeys = null;
    _keyMap = null;
    _keys = null;
    _range = 100003;
    _weightDefault = 40;
    _uniform = false;
    _needKeyMap = false;

    add(node, n, points) {
        var i, key;
        if (Array.isArray(points)) points = this._concat2(new Array(), points);
        else if (this._uniform) { this._needKeyMap = true; points = new Array(n || this._weightDefault); } // Corrected `new new Array`
        else points = this._makeControlPoints(n || this._weightDefault);
        this._nodes.push(node);
        this._nodeKeys.push(points);
        n = points.length;
        if (points[0] !== undefined) this._mapNodePoints(node, points);
        this._keys = null;
        this.keyCount += n;
        this.nodeCount += 1;
        return this;
    }

    _concat2(target, array) {
        for (var i = 0; i < array.length; i++) target.push(array[i]);
        return target;
    }

    _makeControlPoints(n) {
        var attemptCount = 0;
        var i, key, points = new Array(n);
        for (i = 0; i < n; i++) {
            do {
                key = Math.random() * this._range >>> 0;
            } while ((this._keyMap[key] !== undefined || points[key] === 'a') && ++attemptCount < 100);
            if (attemptCount >= 100) throw new Error("unable to find an unused control point, tried 100");
            points[i] = key;
            this._keyMap[key] = true;
        }
        return points;
    }

    _buildKeyMap(n) {
        var nodeCount = 0;
        var newNodes = {};
        for (var i = 0; i < this._nodes.length; i++) if (this._nodeKeys[i][0] === undefined) newNodes[i] = this._nodes[i];
        var newNodePos = Object.keys(newNodes);
        var newNodeCount = newNodePos.length;

        if (this._orderNodes) {
            var newNodesSorted = this._orderNodes(newNodePos.map(function (ix) { return newNodes[ix]; }));
            for (var i = 0; i < newNodePos.length; i++) this._nodes[newNodePos[i]] = newNodesSorted[i];
        }

        var pointCount = newNodeCount * this._weightDefault;
        var step = this._range / pointCount;

        for (var i = 0; i < newNodePos.length; i++) {
            var keys = this._nodeKeys[newNodePos[i]];
            keys.length = this._weightDefault;
            var offset = step * i + step / 2;
            for (var j = 0; j < this._weightDefault; j++) keys[j] = Math.round(offset + (step * newNodeCount) * j);
        }

        this._keyMap = {};
        for (var i = 0; i < this._nodeKeys.length; i++) this._mapNodePoints(this._nodes[i], this._nodeKeys[i]);

        this._needKeyMap = false;
    }

    remove(node) {
        var ix;
        while ((ix = this._nodes.indexOf(node)) >= 0) {
            var keys = this._nodeKeys[ix];
            this._nodes[ix] = this._nodes[this._nodes.length - 1];
            this._nodes.length -= 1;
            this._nodeKeys[ix] = this._nodeKeys[this._nodeKeys.length - 1];
            this._nodeKeys.length -= 1;
            this._keys = null;
            this._needKeyMap = true;
            this._keyMap = null;
            this.nodeCount -= 1;
            this.keyCount -= keys.length;
            ix -= 1;
        }
        return this;
    }

    get(name, count) {
        if (count) return this._getMany(name, count);
        if (!this.keyCount) return null;
        var index = this._locate(name);
        return this._keyMap[this._keys[index]];
    }

    _getMany(name, n) {
        if (!this.keyCount) return null;
        var index = this._locate(name);
        var node, nodes = [];
        for (var i = index; i < this.keyCount && nodes.length < n; i++) {
            node = this._keyMap[this._keys[i]];
            if (nodes.indexOf(node) < 0) nodes.push(node);
        }
        for (var i = 0; i < index && nodes.length < n; i++) {
            node = this._keyMap[this._keys[i]];
            if (nodes.indexOf(node) < 0) nodes.push(node);
        }
        return nodes;
    }

    getNodes() {
        return this._nodes;
    }

    getPoints(node) {
        if (this._needKeyMap) this._buildKeyMap(this._weightDefault);
        var ix = this._nodes.indexOf(node);
        return ix < 0 ? undefined : this._nodeKeys[ix];
    }

    _locate(name) {
        if (this._needKeyMap) this._buildKeyMap(this._weightDefault);
        if (typeof name !== 'string') name = "" + name;
        if (!this._keys) this._buildKeys();
        var h = this._hash(name);
        h = h << 5;
        h = h % this._range;
        return this._absearch(this._keys, h);
    }

    _hash(s) {
        var len = s.length;
        var g, h = 0;
        for (var i = 0; i < len; i++) {
            h = (h << 4) + s.charCodeAt(i);
            g = h & 0xff000000;
            if (g) {
                h &= ~g;
                h ^= (g >>> 24);
            }
        }
        return h;
    }

    _absearch(array, key) {
        var i, j, mid, gap = 25, len = array.length;
        for (i = 0, j = len - 1; j - i > gap;) {
            mid = (i + j) >>> 1;
            if (array[mid] < key) i = mid + 1;
            else j = mid;
        }
        for (; i < len; i++) if (array[i] >= key) return i;
        return array.length === 0 ? -1 : 0;
    }

    _buildKeys() {
        var i, j, nodeKeys, keys = new Array();
        for (i = 0; i < this._nodeKeys.length; i++) {
            nodeKeys = this._nodeKeys[i];
            for (j = 0; j < nodeKeys.length; j++) {
                keys.push(nodeKeys[j]);
            }
        }
        keys.sort(function (a, b) { return a - b; });
        return this._keys = keys;
    }

    _mapNodePoints(node, points) {
        var len = points.length, map = this._keyMap;
        for (var i = 0; i < len; i++) map[points[i]] = node;
    }

    _addNodesArray(nodes) {
        for (var i = 0; i < nodes.length; i++) this.add(nodes[i]);
    }
}
// --- End of ConsistentHash Class ---


const writeTarget = class WriteTarget {
  constructor({
    ensureExists,write
  }){
   this.ensureExists = () => {
        try {
            await fs.mkdir(this.STORAGE_DIR, { recursive: true });
            console.log(`Ensured block storage directory exists: ${this.STORAGE_DIR}`);
        } catch (error) {
            console.error(`Error ensuring block storage directory: ${error.message}`);
            process.exit(1);
        }
   }
  this.write = (blockHash)=> {
      const blockFilePath = path.join(this.STORAGE_DIR, blockHash);

        try {
            await fs.access(blockFilePath); // Check if file exists
            // console.log(`Block already exists (deduplicated): ${blockHash}`); // Can be noisy
            return {
                hash: blockHash,
                stored: false,
                assignedNode: this.consistentHash.get(blockHash)
            };
        } catch (error) {
            // Block does not exist, proceed to store it
            const assignedNode = this.consistentHash.get(blockHash);
            console.log(`Storing new block: ${blockHash}, assigned to conceptual node: ${assignedNode}`);

            await fs.writeFile(blockFilePath, blockBuffer);
            return {
                hash: blockHash,
                stored: true,
                assignedNode: assignedNode
            };
        }
    }
  }
}
// --- BlockStorage Class ---
class BlockStorage {
    constructor({
      storageDir, chunkSizeBytes, storageNodes
    }) {
        this.STORAGE_DIR = storageDir;
        this.CHUNK_SIZE = chunkSizeBytes;
        this.consistentHash = new ConsistentHash({ nodes: storageNodes });

        this._ensureStorageDir();
    }

    async _ensureStorageDir() {

    }

    // --- Function to hash content (SHA-256) ---
    static hashContent(buffer) { // Made static as it's a pure function of content
        return crypto.createHash('sha256').update(buffer).digest('hex');
    }

    // --- Function to store a block ---
    async _storeBlock(blockBuffer) { // Made private as it's an internal helper
        const blockHash = BlockStorage.hashContent(blockBuffer);
        // TODO: write(blockHash)
    }

    /**
     * Stores an object's content, breaking it into blocks, deduplicating,
     * and assigning blocks to conceptual storage nodes.
     * The object is identified by its pre-computed SHA-256 (OID).
     *
     * @param {string} objectOID The pre-computed SHA-256 hash of the full object content.
     * @param {Buffer} objectContent The full Buffer containing the object's content.
     * @returns {Promise<Array<string>>} A promise that resolves to an ordered array of block hashes (the object's recipe).
     */
    async storeObject(objectOID, objectContent) {
        console.log(`\n--- Storing Object OID: ${objectOID} (Size: ${objectContent.length} bytes) ---`);
        const blockHashes = []; // To store the ordered list of block hashes for this object

        let offset = 0;
        while (offset < objectContent.length) {
            const blockBuffer = objectContent.subarray(offset, offset + this.CHUNK_SIZE);
            const { hash: blockHash } = await this._storeBlock(blockBuffer);
            blockHashes.push(blockHash);
            offset += this.CHUNK_SIZE;
        }

        console.log(`Object OID ${objectOID} processing complete. Total blocks: ${blockHashes.length}`);
        console.log(`Object's block recipe (ordered hashes):`, blockHashes);

        // In a real system, this 'blockHashes' array would be stored by your
        // "abstract high-level index nodes" associated with the objectOID.
        return blockHashes;
    }
}
