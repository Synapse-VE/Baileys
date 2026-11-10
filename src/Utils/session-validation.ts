type SessionValidator = (jid: string) => Promise<{ exists: boolean }>

/**
 * Finds JIDs without a usable session, validating in bounded parallel batches.
 * Reads are independent, so a batch can run concurrently, but unbounded fan-out
 * would spike memory and auth-state reads on large groups.
 */
export const findJidsWithoutSession = async (
	jids: string[],
	validateSession: SessionValidator,
	{ force = false, batchSize = 100 }: { force?: boolean; batchSize?: number } = {}
) => {
	if (force) return [...jids]

	const missing: string[] = []
	for (let index = 0; index < jids.length; index += batchSize) {
		const batch = jids.slice(index, index + batchSize)
		const checks = await Promise.all(batch.map(async jid => (await validateSession(jid)).exists))
		for (const [batchIndex, jid] of batch.entries()) {
			if (!checks[batchIndex]) missing.push(jid)
		}
	}

	return missing
}
