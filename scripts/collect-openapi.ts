#!/usr/bin/env tsx

import path from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';

const [, , rawUrl] = process.argv;

if (!rawUrl) {
  console.error('Usage: tsx scripts/collect-openapi.ts <fal-model-url>');
  process.exit(1);
}

let parsedUrl: URL;
try {
  parsedUrl = new URL(rawUrl);
} catch (error) {
  console.error(`Invalid URL provided: ${rawUrl}`);
  process.exit(1);
}

const modelsPrefix = '/models/';
if (!parsedUrl.pathname.startsWith(modelsPrefix)) {
  console.error('Expected a fal.ai model URL like https://fal.ai/models/<endpointId>');
  process.exit(1);
}

const endpointId = decodeURIComponent(parsedUrl.pathname.slice(modelsPrefix.length)).replace(/\/$/, '');
const endpointSegments = endpointId.split('/');

if (endpointSegments.length < 2) {
  console.error(`Unexpected endpoint format in ${endpointId}`);
  process.exit(1);
}

const response = await fetch(rawUrl, {
  headers: {
    'user-agent': 'Mozilla/5.0 (compatible; FalOpenApiCollector/1.0)'
  }
});

if (!response.ok) {
  console.error(`Failed to load ${rawUrl}: ${response.status} ${response.statusText}`);
  process.exit(1);
}

const html = await response.text();
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const extractModeCandidates = (markup: string): string[] => {
  const marker = '\\"modes\\":[';
  const startIndex = markup.indexOf(marker);

  if (startIndex === -1) {
    return [];
  }

  let depth = 1;
  const candidates: string[] = [];
  const baseIndex = startIndex + marker.length;

  for (let index = baseIndex; index < markup.length; index += 1) {
    const char = markup[index];

    if (char === '[') {
      depth += 1;
      continue;
    }

    if (char === ']') {
      depth -= 1;

      if (depth === 0) {
        const payload = markup.slice(baseIndex, index);
        const idPattern = /\\"id\\":\\"([^\\"]+)\\"/g;
        const uniqueCandidates = new Set<string>();
        let match: RegExpExecArray | null;

        while ((match = idPattern.exec(payload)) !== null) {
          uniqueCandidates.add(match[1]);
        }

        return Array.from(uniqueCandidates);
      }
    }
  }

  return [];
};

const computeFamilyPrefix = (candidates: string[]): string => {
  if (candidates.length === 0) {
    return '';
  }

  const segmentLists = candidates.map((value) => value.split('/'));
  let prefixLength = Math.min(...segmentLists.map((segments) => segments.length));

  for (let segmentIndex = 0; segmentIndex < prefixLength; segmentIndex += 1) {
    const expected = segmentLists[0][segmentIndex];

    if (!segmentLists.every((segments) => segments[segmentIndex] === expected)) {
      prefixLength = segmentIndex;
      break;
    }
  }

  if (prefixLength === 0) {
    return candidates[0];
  }

  return segmentLists[0].slice(0, prefixLength).join('/');
};

const modeCandidates = extractModeCandidates(html);

let filteredCandidates: string[] = [];
let resolvedFamilyPrefix = '';

if (modeCandidates.length > 0) {
  filteredCandidates = modeCandidates;
} else {
  let collectedCandidates: string[] = [];
  const maxSuffixLength = Math.min(3, endpointSegments.length - 1);

  for (let suffixLength = maxSuffixLength; suffixLength >= 1; suffixLength -= 1) {
    const familyPrefixSegments = endpointSegments.slice(0, endpointSegments.length - suffixLength);
    if (familyPrefixSegments.length === 0) {
      continue;
    }

    const familyPrefix = familyPrefixSegments.join('/');
    const dynamicPattern = Array.from({ length: suffixLength }, () => '[a-z0-9-]+').join('/');
    const familyPattern = new RegExp(`${escapeRegex(familyPrefix)}\/${dynamicPattern}`, 'gi');
    const rawMatches = Array.from(html.matchAll(familyPattern)).map((match) => match[0]);

    if (rawMatches.length === 0) {
      continue;
    }

    const uniqueMatches = Array.from(new Set(rawMatches));
    collectedCandidates = uniqueMatches;
    resolvedFamilyPrefix = familyPrefix;

    if (uniqueMatches.includes(endpointId)) {
      break;
    }
  }

  if (collectedCandidates.length === 0) {
    console.error('No related endpoints found in the page. Fal may have changed the layout.');
    process.exit(1);
  }

  if (!collectedCandidates.includes(endpointId)) {
    collectedCandidates.push(endpointId);
  }

  const uniqueCandidates = Array.from(new Set(collectedCandidates));
  const expectedSegmentCount = endpointSegments.length;
  const minimumSharedPrefixSegments = expectedSegmentCount > 1 ? expectedSegmentCount - 1 : 1;

  const matchingCandidates = uniqueCandidates.filter((value) => {
    const candidateSegments = value.split('/');
    if (candidateSegments.length !== expectedSegmentCount) {
      return false;
    }

    let sharedPrefixSegments = 0;
    while (
      sharedPrefixSegments < expectedSegmentCount &&
      candidateSegments[sharedPrefixSegments] === endpointSegments[sharedPrefixSegments]
    ) {
      sharedPrefixSegments += 1;
    }

    return sharedPrefixSegments >= minimumSharedPrefixSegments;
  });

  const fallbackCandidates = matchingCandidates.length > 0 ? matchingCandidates : [endpointId];

  const dedupedFallbackCandidates = fallbackCandidates.filter((value) =>
    !fallbackCandidates.some((other) => other !== value && other.startsWith(value))
  );

  if (dedupedFallbackCandidates.length === 0) {
    console.error('Only partial matches were found; could not resolve version selector entries.');
    process.exit(1);
  }

  dedupedFallbackCandidates.sort();
  filteredCandidates = dedupedFallbackCandidates;
}

if (!filteredCandidates.includes(endpointId)) {
  filteredCandidates = [endpointId, ...filteredCandidates];
}

filteredCandidates = Array.from(new Set(filteredCandidates));

if (filteredCandidates.length === 0) {
  console.error('No related endpoints found after filtering.');
  process.exit(1);
}

const baseOutputDir = path.join(process.cwd(), 'scripts', 'openapi');
await rm(baseOutputDir, { recursive: true, force: true });
await mkdir(baseOutputDir, { recursive: true });

const familyPrefixForDisplay =
  computeFamilyPrefix(filteredCandidates) ||
  resolvedFamilyPrefix ||
  endpointSegments.slice(0, -1).join('/') ||
  endpointSegments[0];

console.log(`Detected ${filteredCandidates.length} endpoint variants for ${familyPrefixForDisplay}:`);

for (const candidate of filteredCandidates) {
  const openapiUrl = new URL('/api/openapi/queue/openapi.json', parsedUrl.origin);
  openapiUrl.searchParams.set('endpoint_id', candidate);

  const specResponse = await fetch(openapiUrl, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; FalOpenApiCollector/1.0)'
    }
  });

  if (!specResponse.ok) {
    console.error(`Failed to download OpenAPI for ${candidate}: ${specResponse.status} ${specResponse.statusText}`);
    process.exit(1);
  }

  const specText = await specResponse.text();
  let formattedSpec = specText;
  try {
    formattedSpec = JSON.stringify(JSON.parse(specText), null, 2);
  } catch (error) {
    // leave as-is if the payload is not valid JSON
  }

  const fileName = `${candidate.replace(/[\\/]/g, '__')}.json`;
  const filePath = path.join(baseOutputDir, fileName);
  await writeFile(filePath, formattedSpec, 'utf8');

  console.log(` - ${candidate} -> ${path.relative(process.cwd(), filePath)}`);
}
