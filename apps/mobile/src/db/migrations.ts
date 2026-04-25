import { schemaMigrations, addColumns, createTable } from '@nozbe/watermelondb/Schema/migrations'

export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        addColumns({
          table: 'ponds',
          columns: [
            { name: 'boundary', type: 'string', isOptional: true },
            { name: 'is_active', type: 'boolean' },
            { name: 'current_species', type: 'string', isOptional: true },
            { name: 'current_stock_count', type: 'number', isOptional: true },
          ],
        }),
        addColumns({
          table: 'harvests',
          columns: [
            { name: 'species', type: 'string', isOptional: true },
            { name: 'is_partial', type: 'boolean' },
            { name: 'fish_count', type: 'number', isOptional: true },
          ],
        }),
        createTable({
          name: 'stocking_logs',
          columns: [
            { name: 'pond_id', type: 'string', isIndexed: true },
            { name: 'species', type: 'string' },
            { name: 'quantity', type: 'number' },
            { name: 'average_weight_g', type: 'number', isOptional: true },
            { name: 'source', type: 'string', isOptional: true },
            { name: 'stocked_by', type: 'string' },
            { name: 'created_at', type: 'number' },
            { name: 'status', type: 'string' },
          ],
        }),
        createTable({
          name: 'pond_history',
          columns: [
            { name: 'pond_id', type: 'string', isIndexed: true },
            { name: 'event_type', type: 'string' },
            { name: 'event_data', type: 'string' },
            { name: 'created_at', type: 'number' },
            { name: 'recorded_by', type: 'string' },
          ],
        }),
      ],
    },
  ],
})
