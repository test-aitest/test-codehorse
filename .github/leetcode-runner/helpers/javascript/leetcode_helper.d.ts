// TypeScript型定義

export class ListNode {
  val: number;
  next: ListNode | null;
  constructor(val?: number, next?: ListNode | null);
}

export class TreeNode {
  val: number;
  left: TreeNode | null;
  right: TreeNode | null;
  constructor(val?: number, left?: TreeNode | null, right?: TreeNode | null);
}

export function parseList(s: string): any[];
export function parseInt(s: string): number;
export function parseFloat(s: string): number;
export function parseString(s: string): string;
export function parseBool(s: string): boolean;

export function listToLinkedList(arr: number[]): ListNode | null;
export function linkedListToList(head: ListNode | null): number[];
export function parseLinkedList(s: string): ListNode | null;

export function listToTree(arr: (number | null)[]): TreeNode | null;
export function treeToList(root: TreeNode | null): (number | null)[];
export function parseTree(s: string): TreeNode | null;

export function parseInput(s: string, typeHint?: string): any;
export function formatOutput(value: any): string;
