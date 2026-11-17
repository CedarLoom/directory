import { Table } from '@mantine/core';
import type { ReactNode } from 'react';

/** A table that scrolls sideways on a narrow screen; its last column holds numbers. */
export function ScrollTable({ headers, children }: { headers: readonly ReactNode[]; children: ReactNode }) {
  return (
    <Table.ScrollContainer minWidth={0}>
      <Table>
        <Table.Thead>
          <Table.Tr>
            {headers.map((header, index) => (
              <Table.Th key={index} scope="col" data-numeric={index === headers.length - 1 || undefined}>
                {header}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>{children}</Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
