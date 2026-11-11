// Central Diagnostics & Telemetry Logger for Firestore Operations
// Tracks and formats all Reads, Listeners, Local Cache Hits, and Writes in real-time.

export interface FirestoreReadMetric {
  id: string;
  collection: string;
  source: string;
  reason?: string;
  documentsCount: number;
  timestamp: string;
  details?: string;
}

export interface FirestoreListenerMetric {
  id: string;
  collection: string;
  source: string;
  createdAt: string;
  createCount: number;
  lastEventAt?: string;
  eventCount: number;
  documentsReceived: number;
}

export interface FirestoreWriteMetric {
  id: string;
  collection: string;
  operation: string;
  source: string;
  timestamp: string;
  details?: string;
}

export interface LocalCacheHitMetric {
  id: string;
  collection: string;
  source: string;
  timestamp: string;
  details?: string;
}

class DiagnosticsStore {
  public totalReads = 0;
  public totalRealTimeDocs = 0;
  public totalWrites = 0;
  public totalCacheHits = 0;

  public readLogs: FirestoreReadMetric[] = [];
  public writeLogs: FirestoreWriteMetric[] = [];
  public listenerMetrics: Map<string, FirestoreListenerMetric> = new Map();
  public cacheHitLogs: LocalCacheHitMetric[] = [];

  public logRead(collection: string, source: string, documentsCount: number, reason?: string, details?: string) {
    this.totalReads += documentsCount;
    const metric: FirestoreReadMetric = {
      id: `read-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      collection,
      source,
      reason,
      documentsCount,
      timestamp: new Date().toISOString(),
      details
    };
    this.readLogs.unshift(metric);
    if (this.readLogs.length > 500) this.readLogs.pop();

    console.log(
      `%c[Firestore READ]%c\ncollection=${collection}\nsource=${source}\nreason=${reason || 'None'}\ntime=${metric.timestamp}\ndocuments=${documentsCount}${details ? `\ndetails=${details}` : ''}`,
      'color: #EF4444; font-weight: bold;',
      'color: inherit;'
    );
  }

  public registerListener(collection: string, source: string) {
    const existing = this.listenerMetrics.get(collection);
    const now = new Date().toISOString();
    if (existing) {
      existing.createCount += 1;
      existing.lastEventAt = now;
    } else {
      const metric: FirestoreListenerMetric = {
        id: `listener-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        collection,
        source,
        createdAt: now,
        createCount: 1,
        eventCount: 0,
        documentsReceived: 0
      };
      this.listenerMetrics.set(collection, metric);
    }

    console.log(
      `%c[Firestore LISTENER]%c\ncollection=${collection}\nsource=${source}\ncreated=${now}\ntotalCreatedCount=${this.listenerMetrics.get(collection)?.createCount || 1}`,
      'color: #3B82F6; font-weight: bold;',
      'color: inherit;'
    );
  }

  public logListenerEvent(collection: string, documentsReceived: number) {
    this.totalRealTimeDocs += documentsReceived;
    const listener = this.listenerMetrics.get(collection);
    if (listener) {
      listener.eventCount += 1;
      listener.documentsReceived += documentsReceived;
      listener.lastEventAt = new Date().toISOString();
    }
  }

  public logCacheHit(collection: string, source: string, details?: string) {
    this.totalCacheHits += 1;
    const metric: LocalCacheHitMetric = {
      id: `cache-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      collection,
      source,
      timestamp: new Date().toISOString(),
      details
    };
    this.cacheHitLogs.unshift(metric);
    if (this.cacheHitLogs.length > 500) this.cacheHitLogs.pop();

    console.log(
      `%c[LOCAL CACHE HIT]%c\ncollection=${collection}\nsource=${source}${details ? `\ndetails=${details}` : ''}`,
      'color: #10B981; font-weight: bold;',
      'color: inherit;'
    );
  }

  public logWrite(collection: string, operation: string, source: string, details?: string) {
    this.totalWrites += 1;
    const metric: FirestoreWriteMetric = {
      id: `write-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      collection,
      operation,
      source,
      timestamp: new Date().toISOString(),
      details
    };
    this.writeLogs.unshift(metric);
    if (this.writeLogs.length > 500) this.writeLogs.pop();

    console.log(
      `%c[Firestore WRITE]%c\ncollection=${collection}\noperation=${operation}\nsource=${source}\ntime=${metric.timestamp}${details ? `\ndetails=${details}` : ''}`,
      'color: #F59E0B; font-weight: bold;',
      'color: inherit;'
    );
  }

  public getSummary() {
    return {
      totalReads: this.totalReads,
      totalRealTimeDocs: this.totalRealTimeDocs,
      totalWrites: this.totalWrites,
      totalCacheHits: this.totalCacheHits,
      activeListenersCount: this.listenerMetrics.size,
      listeners: Array.from(this.listenerMetrics.values()),
      recentReads: this.readLogs.slice(0, 50),
      recentWrites: this.writeLogs.slice(0, 50),
      recentCacheHits: this.cacheHitLogs.slice(0, 50)
    };
  }

  public resetMetrics() {
    this.totalReads = 0;
    this.totalRealTimeDocs = 0;
    this.totalWrites = 0;
    this.totalCacheHits = 0;
    this.readLogs = [];
    this.writeLogs = [];
    this.cacheHitLogs = [];
  }
}

export const diagnostics = new DiagnosticsStore();
