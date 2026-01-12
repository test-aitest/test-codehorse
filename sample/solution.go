package main

type Solution struct{}

func (s *Solution) MaxArea(height []int) int {
	l := 0
	r := len(height) - 1
	maxarea := 0

	for l < r {
		length := min(height[l], height[r])
		width := r - l
		area := length * width
		maxarea = max(maxarea, area)

		if height[l] < height[r] {
			l++
		} else {
			r--
		}
	}

	return maxarea
}
