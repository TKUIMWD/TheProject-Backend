export type UniqueConstraintDuplicateCheckKey =
    | "users.email"
    | "users.username"
    | "compute_resource_plans.name"
    | "vms.pve_node_pve_vmid"
    | "vm_tasks.task_id";

export type DuplicateCheckSpec = {
    key: UniqueConstraintDuplicateCheckKey;
    collection: string;
    label: string;
    pipeline: Record<string, unknown>[];
};

export type DuplicateGroup = {
    _id: unknown;
    ids: unknown[];
    count: number;
};

export type DuplicateCheckResult = {
    key: UniqueConstraintDuplicateCheckKey;
    collection: string;
    label: string;
    duplicates: DuplicateGroup[];
};

const DUPLICATE_CHECK_SPECS: DuplicateCheckSpec[] = [
    {
        key: "users.email",
        collection: "users",
        label: "users.email",
        pipeline: [
            { $match: { email: { $type: "string", $ne: "" } } },
            { $group: { _id: { $toLower: "$email" }, ids: { $push: "$_id" }, count: { $sum: 1 } } },
            { $match: { count: { $gt: 1 } } },
            { $sort: { count: -1 } }
        ]
    },
    {
        key: "users.username",
        collection: "users",
        label: "users.username",
        pipeline: [
            { $match: { username: { $type: "string", $ne: "" } } },
            { $group: { _id: { $toLower: "$username" }, ids: { $push: "$_id" }, count: { $sum: 1 } } },
            { $match: { count: { $gt: 1 } } },
            { $sort: { count: -1 } }
        ]
    },
    {
        key: "compute_resource_plans.name",
        collection: "compute_resource_plans",
        label: "compute_resource_plans.name",
        pipeline: [
            { $match: { name: { $type: "string", $ne: "" } } },
            { $group: { _id: { $toLower: "$name" }, ids: { $push: "$_id" }, count: { $sum: 1 } } },
            { $match: { count: { $gt: 1 } } },
            { $sort: { count: -1 } }
        ]
    },
    {
        key: "vms.pve_node_pve_vmid",
        collection: "vms",
        label: "vms.{pve_node,pve_vmid}",
        pipeline: [
            { $match: { pve_node: { $type: "string", $ne: "" }, pve_vmid: { $exists: true, $ne: "" } } },
            { $group: { _id: { pve_node: "$pve_node", pve_vmid: { $toString: "$pve_vmid" } }, ids: { $push: "$_id" }, count: { $sum: 1 } } },
            { $match: { count: { $gt: 1 } } },
            { $sort: { count: -1 } }
        ]
    },
    {
        key: "vm_tasks.task_id",
        collection: "vm_tasks",
        label: "vm_tasks.task_id",
        pipeline: [
            { $match: { task_id: { $type: "string", $ne: "" } } },
            { $group: { _id: "$task_id", ids: { $push: "$_id" }, count: { $sum: 1 } } },
            { $match: { count: { $gt: 1 } } },
            { $sort: { count: -1 } }
        ]
    }
];

export function listUniqueConstraintDuplicateCheckSpecs(): DuplicateCheckSpec[] {
    return DUPLICATE_CHECK_SPECS.map(spec => ({
        ...spec,
        pipeline: spec.pipeline.map(stage => ({ ...stage }))
    }));
}

export function hasDuplicateCheckFailures(results: DuplicateCheckResult[]): boolean {
    return results.some(result => result.duplicates.length > 0);
}

export function summarizeDuplicateCheckResults(results: DuplicateCheckResult[]): {
    checked: number;
    failed: number;
    duplicateGroups: number;
} {
    return {
        checked: results.length,
        failed: results.filter(result => result.duplicates.length > 0).length,
        duplicateGroups: results.reduce((total, result) => total + result.duplicates.length, 0)
    };
}

export function formatDuplicateCheckResults(results: DuplicateCheckResult[]): string {
    const summary = summarizeDuplicateCheckResults(results);
    const lines = [
        `unique-constraint duplicate preflight: ${summary.checked} checked, ${summary.failed} failed, ${summary.duplicateGroups} duplicate group(s)`
    ];

    for (const result of results) {
        if (result.duplicates.length === 0) {
            lines.push(`[PASS] ${result.label}`);
            continue;
        }

        lines.push(`[FAIL] ${result.label}: ${result.duplicates.length} duplicate group(s)`);
        for (const duplicate of result.duplicates.slice(0, 20)) {
            lines.push(`  - key=${JSON.stringify(duplicate._id)} count=${duplicate.count} ids=${duplicate.ids.map(String).join(",")}`);
        }
        if (result.duplicates.length > 20) {
            lines.push(`  - ... ${result.duplicates.length - 20} more duplicate group(s)`);
        }
    }

    return lines.join("\n");
}
