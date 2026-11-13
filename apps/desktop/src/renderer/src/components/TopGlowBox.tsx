import React from 'react';

export interface TopGlowBoxProps {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
  roundedClassName?: string;
  innerRoundedClassName?: string;
}

/**
 * 样式装饰器组件：为容器提供顶部微弱白灰光晕与自上而下渐隐的左右边缘描边效果。
 */
export const TopGlowBox: React.FC<TopGlowBoxProps> = ({
  children,
  className = '',
  innerClassName = '',
  roundedClassName = 'rounded-2xl',
  innerRoundedClassName = 'rounded-[15px]'
}) => {
  return (
    <div
      className={`${roundedClassName} bg-gradient-to-b from-white/[0.08] via-white/[0.025] to-transparent p-[1px] shadow-[0_-4px_10px_-3px_rgba(255,255,255,0.045)] ${className}`.trim()}
    >
      <div className={`${innerRoundedClassName} bg-[#111111] ${innerClassName}`.trim()}>
        {children}
      </div>
    </div>
  );
};
