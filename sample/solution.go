package main

type Solution struct{} // テストです

func (s *Solution) TwoSum(nums []int, target int) []int { // ← TwoSum に変更
	seen := make(map[int]int)
	for i, num := range nums {
		if j, ok := seen[target-num]; ok {
			return []int{j, i}
		}
		seen[num] = i
	}
	return []int{} // 空のスライスを返す
}
