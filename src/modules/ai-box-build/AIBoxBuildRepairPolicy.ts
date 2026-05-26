import { AIBoxBuildArtifacts } from "../../interfaces/AIBoxBuildJob";
import {
    AIBoxArtifactName,
    isUsableAIBoxArtifact
} from "./AIBoxBuildArtifactPolicy";

export function shouldUseTargetedArtifactRepair(message: string, artifacts: AIBoxBuildArtifacts): boolean {
    return /setup\.?md|design\.?md|writeup\.?md|artifact/i.test(message)
        || !isUsableAIBoxArtifact('design_md', artifacts.design_md)
        || !isUsableAIBoxArtifact('setup_md', artifacts.setup_md)
        || !isUsableAIBoxArtifact('writeup_md', artifacts.writeup_md);
}

export function targetArtifactsForRepair(message: string, artifacts: AIBoxBuildArtifacts): AIBoxArtifactName[] {
    const targets: AIBoxArtifactName[] = [];
    const add = (artifactName: AIBoxArtifactName) => {
        if (!targets.includes(artifactName)) targets.push(artifactName);
    };

    if (/design\.?md/i.test(message) || !isUsableAIBoxArtifact('design_md', artifacts.design_md)) add('design_md');
    if (/setup\.?md/i.test(message) || !isUsableAIBoxArtifact('setup_md', artifacts.setup_md)) add('setup_md');
    if (/writeup\.?md/i.test(message) || !isUsableAIBoxArtifact('writeup_md', artifacts.writeup_md)) add('writeup_md');

    return targets.length > 0 ? targets : ['design_md', 'setup_md', 'writeup_md'];
}
