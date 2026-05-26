import dotenv from "dotenv";
import mongoose from "mongoose";
import {
    DuplicateCheckResult,
    formatDuplicateCheckResults,
    hasDuplicateCheckFailures,
    listUniqueConstraintDuplicateCheckSpecs
} from "../modules/data-hardening/UniqueConstraintDuplicateCheck";

dotenv.config();

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value || value.trim() === "") {
        throw new Error(`${name} is required`);
    }
    return value;
}

function buildMongoUri(): string {
    const user = requireEnv("DBUSER");
    const password = encodeURIComponent(requireEnv("DBPASSWORD"));
    const host = requireEnv("DBHOST");
    const port = requireEnv("DBPORT");
    const dbName = requireEnv("DBNAME");
    return `mongodb://${user}:${password}@${host}:${port}/${dbName}`;
}

async function main(): Promise<void> {
    const dbName = requireEnv("DBNAME");
    const mongo = await mongoose.connect(buildMongoUri());
    const db = mongo.connection.db;
    if (!db) {
        throw new Error("MongoDB connection did not expose a database handle");
    }

    const results: DuplicateCheckResult[] = [];
    for (const spec of listUniqueConstraintDuplicateCheckSpecs()) {
        const duplicates = await db.collection(spec.collection).aggregate(spec.pipeline).toArray();
        results.push({
            key: spec.key,
            collection: spec.collection,
            label: spec.label,
            duplicates: duplicates.map(duplicate => ({
                _id: duplicate._id,
                ids: duplicate.ids ?? [],
                count: duplicate.count ?? 0
            }))
        });
    }

    process.stdout.write(`database: ${dbName}\n`);
    process.stdout.write(`${formatDuplicateCheckResults(results)}\n`);

    await mongoose.disconnect();

    if (hasDuplicateCheckFailures(results)) {
        process.exitCode = 1;
    }
}

main().catch(async (error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    await mongoose.disconnect().catch(() => undefined);
    process.exitCode = 1;
});
