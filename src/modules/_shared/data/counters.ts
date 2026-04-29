import type { ICounter } from '@/modules/counters/interface';

export const getCounters = (): ICounter[] => {
  return [
    { name: 'examples', template: 'EXAMPLE/<seq>', seq: 0 },
  ];
};
