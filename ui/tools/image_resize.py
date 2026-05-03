"""
训练图像缩放预处理工具
将图片缩放到最接近的预设目标分辨率，保持宽高比
支持批量转换为 JPG/WEBP 格式，支持禁用缩放仅转换
支持双击运行的图形界面
"""

import os
import sys
import threading
import json
from pathlib import Path
from typing import Tuple, List, Optional

from PIL import Image

# 尝试导入 tkinter（Python 自带）
try:
    import tkinter as tk
    from tkinter import ttk, filedialog, scrolledtext, messagebox, simpledialog
    HAS_GUI = True
except ImportError:
    HAS_GUI = False
    # CLI 模式下提供占位符，避免类定义时 NameError
    import types
    tk = types.ModuleType('tk')
    tk.Toplevel = object
    tk.Tk = object
    ttk = filedialog = scrolledtext = messagebox = simpledialog = None

# 默认目标分辨率列表（宽x高）
DEFAULT_RESOLUTIONS: List[Tuple[int, int]] = [
    (768, 1344),   
    (832, 1216),   
    (896, 1152),   
    (1024, 1024),  
    (1152, 896),  
    (1216, 832),   
    (1344, 768),   
]

# 配置文件路径
CONFIG_FILE = Path(__file__).parent / "image_resize_config.json"

# 支持的图片格式
SUPPORTED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.bmp'}


def load_resolutions() -> List[Tuple[int, int]]:
    """从配置文件加载分辨率列表"""
    try:
        if CONFIG_FILE.exists():
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                resolutions = [tuple(r) for r in data.get('resolutions', [])]
                if resolutions:
                    return resolutions
    except Exception:
        pass
    return DEFAULT_RESOLUTIONS.copy()


def save_resolutions(resolutions: List[Tuple[int, int]]):
    """保存分辨率列表到配置文件"""
    try:
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump({'resolutions': resolutions}, f, indent=2)
    except Exception as e:
        print(f"保存配置失败: {e}")


def find_closest_resolution(image_ratio: float, resolutions: List[Tuple[int, int]]) -> Tuple[int, int]:
    """
    根据图片宽高比，找到最接近的目标分辨率
    
    Args:
        image_ratio: 原图的宽高比 (width / height)
        resolutions: 目标分辨率列表
    
    Returns:
        最接近的目标分辨率 (width, height)
    """
    if not resolutions:
        return (1024, 1024)
    
    # 按宽高比排序
    sorted_res = sorted(resolutions, key=lambda r: r[0] / r[1])
    
    min_diff = float('inf')
    best_target = sorted_res[0]
    
    for target in sorted_res:
        target_ratio = target[0] / target[1]
        diff = abs(image_ratio - target_ratio)
        
        if diff < min_diff:
            min_diff = diff
            best_target = target
        elif diff > min_diff:
            break
    
    return best_target


def get_output_format(filepath: Path) -> str:
    """根据文件扩展名确定保存格式"""
    ext = filepath.suffix.lower()
    format_map = {
        '.jpg': 'JPEG',
        '.jpeg': 'JPEG',
        '.png': 'PNG',
        '.webp': 'WEBP',
        '.bmp': 'BMP',
    }
    return format_map.get(ext, 'PNG')


def process_image(
    filepath: Path,
    resolutions: List[Tuple[int, int]],
    output_dir: Optional[Path] = None,
    quality: int = 95,
    exact_size: bool = True,
    target_format: str = 'ORIGINAL',  # 'ORIGINAL', 'JPEG', 'WEBP', 'PNG'
    enable_resize: bool = True,
    log_callback=None,
    new_name: Optional[str] = None,
    delete_original: bool = False,
    sync_metadata: bool = True
) -> str:
    """
    处理单张图片：缩放到最接近的目标分辨率 或 转换格式
    
    Args:
        filepath: 图片文件路径
        resolutions: 目标分辨率列表
        output_dir: 输出目录，None 表示覆盖原文件(或同目录下创建)
        quality: JPEG/WEBP 保存质量 (1-100)
        exact_size: 是否精确裁剪到目标尺寸 (仅 enable_resize=True 时有效)
        target_format: 目标格式 ('ORIGINAL', 'JPEG', 'WEBP', 'PNG')
        enable_resize: 是否启用缩放处理
        log_callback: 日志回调函数
        new_name: 指定新的文件名（不含扩展名）
        delete_original: 处理成功后是否删除原图片文件
        sync_metadata: 是否同步重命名/移动关联的描述文件 (.txt, .npz, .caption)
    
    Returns:
        处理状态: 'success' | 'skip' | 'fail'
    """
    def log(msg):
        if log_callback:
            log_callback(msg)
        else:
            try:
                print(msg)
            except UnicodeEncodeError:
                print(msg.encode('utf-8', errors='replace').decode('ascii', errors='replace'))
    
    # 确定目标格式和扩展名
    target_format = target_format.upper()
    save_format = target_format
    output_ext = filepath.suffix.lower()
    
    if target_format == 'JPEG':
        save_format = 'JPEG'
        output_ext = '.jpg'
    elif target_format == 'WEBP':
        save_format = 'WEBP'
        output_ext = '.webp'
    elif target_format == 'PNG':
        save_format = 'PNG'
        output_ext = '.png'
    else:
        # ORIGINAL
        save_format = get_output_format(filepath)
    
    try:
        with Image.open(filepath) as img:
            # 模式处理
            if save_format == 'JPEG':
                # JPEG 不支持透明通道，需转换为 RGB (通常用白色背景)
                if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
                    if img.mode != 'RGBA':
                        img = img.convert('RGBA')
                    background = Image.new("RGB", img.size, (255, 255, 255))
                    background.paste(img, mask=img.split()[-1])
                    img = background
                elif img.mode != 'RGB':
                    img = img.convert('RGB')
            elif save_format == 'WEBP':
                # WEBP 支持透明，但需确保模式兼容
                if img.mode == 'P':
                    img = img.convert('RGBA')
            else:
                # 其他情况，如果不是 PNG/WEBP 但有透明度，可能需要处理，这里简单处理
                if img.mode == 'P':
                    img = img.convert('RGBA')
            
            width, height = img.size
            final_w, final_h = width, height
            final_img = img
            
            # 缩放处理
            if enable_resize and resolutions:
                original_ratio = width / height
                
                # 匹配最接近的预期分辨率
                target_w, target_h = find_closest_resolution(original_ratio, resolutions)
                
                # 如果尺寸已经完全匹配，且不需要转换格式，且不需要重命名，跳过处理
                if (width == target_w and height == target_h 
                        and target_format == 'ORIGINAL' and not new_name):
                    log(f"⏭ 跳过 (尺寸已符合): {filepath.name}")
                    return 'skip'
                
                if exact_size:
                    # 精确模式：缩放后居中裁剪到目标尺寸
                    scale_ratio = max(target_w / width, target_h / height)
                    scaled_width = int(width * scale_ratio)
                    scaled_height = int(height * scale_ratio)
                    
                    resized_img = img.resize(
                        (scaled_width, scaled_height),
                        resample=Image.Resampling.LANCZOS
                    )
                    
                    left = (scaled_width - target_w) // 2
                    top = (scaled_height - target_h) // 2
                    right = left + target_w
                    bottom = top + target_h
                    
                    final_img = resized_img.crop((left, top, right, bottom))
                    final_w, final_h = target_w, target_h
                else:
                    # 保持比例模式：仅缩放，不裁剪
                    scale_ratio = min(target_w / width, target_h / height)
                    scaled_w = int(width * scale_ratio)
                    scaled_h = int(height * scale_ratio)
                    
                    # 仅当尺寸需要改变时才缩放
                    if scaled_w != width or scaled_h != height:
                        final_img = img.resize(
                            (scaled_w, scaled_h),
                            resample=Image.Resampling.LANCZOS
                        )
                        final_w, final_h = scaled_w, scaled_h
            
            # 确定输出路径
            if output_dir:
                # 使用新名称或原名称，并更改后缀
                base_name = new_name if new_name else filepath.stem
                output_path = output_dir / f"{base_name}{output_ext}"
            else:
                # 如果不指定输出目录，且重命名，则在原目录重命名
                base_name = new_name if new_name else filepath.stem
                output_path = filepath.parent / f"{base_name}{output_ext}"

            # 检查是否真的有变化（路径是否相同） 
            is_same_path = (output_path.resolve() == filepath.resolve())

            # 通用跳过：如果输出路径与原路径相同，且尺寸未改变，说明无需处理
            # 覆盖场景：禁用缩放+无重命名+原格式，或缩放后尺寸恰好一致+无重命名
            if is_same_path and final_w == width and final_h == height:
                log(f"⏭ 跳过 (无需处理): {filepath.name}")
                return 'skip'

            # 冲突检测：如果目标路径已存在且不是原文件自身，则自动追加后缀避免覆盖
            if not is_same_path and output_path.exists():
                conflict_dir = output_dir if output_dir else filepath.parent
                # 解析当前名称中的前缀和数字部分，递增数字寻找可用名称
                import re
                base_name_str = output_path.stem
                m = re.match(r'^(.+?)_(\d+)$', base_name_str)
                if m:
                    prefix_part = m.group(1)
                    start_num = int(m.group(2)) + 1
                else:
                    prefix_part = base_name_str
                    start_num = 1
                
                for try_num in range(start_num, start_num + 10000):
                    candidate_name = f"{prefix_part}_{try_num}"
                    candidate_path = conflict_dir / f"{candidate_name}{output_ext}"
                    if candidate_path.resolve() == filepath.resolve():
                        output_path = candidate_path
                        is_same_path = True
                        break
                    if not candidate_path.exists():
                        output_path = candidate_path
                        log(f"⚠ 目标文件已存在，顺延为: {candidate_path.name}")
                        break
                else:
                    log(f"✗ 无法找到可用文件名: {filepath.name}")
                    return 'fail'

            # 处理关联文件 (.txt, .npz, .caption)
            if sync_metadata:
                for meta_ext in ['.txt', '.npz', '.caption', '.json']:
                    meta_file = filepath.with_suffix(meta_ext)
                    if meta_file.exists():
                        new_meta_path = output_path.with_suffix(meta_ext)
                        if new_meta_path != meta_file:
                            try:
                                import shutil
                                # 如果目标已存在，先删除（避免 WinError 183）
                                if new_meta_path.exists():
                                    log(f"⚠ 关联文件已存在，将覆盖: {new_meta_path.name}")
                                    new_meta_path.unlink()
                                if output_dir:  # 输出到新目录用复制
                                    shutil.copy2(meta_file, new_meta_path)
                                else:  # 原地处理用重命名
                                    meta_file.rename(new_meta_path)
                            except Exception as e:
                                log(f"⚠ 无法处理关联文件 {meta_file.name}: {e}")

            # 保存图片
            save_kwargs = {'optimize': True}
            if save_format in ('JPEG', 'WEBP'):
                save_kwargs['quality'] = quality
                if save_format == 'WEBP':
                     save_kwargs['method'] = 6  # 最高压缩效率
            
            final_img.save(output_path, format=save_format, **save_kwargs)
            
            action_str = f"{width}x{height} → {final_w}x{final_h}"
            if target_format != 'ORIGINAL':
                action_str += f" ({save_format})"
            
            rename_str = f" → {output_path.name}" if new_name else ""
            log(f"✓ 已处理: {filepath.name}{rename_str} | {action_str}")

            # 如果输出路径不同，且要求删除原图，则执行删除
            if not is_same_path and delete_original:
                try:
                    filepath.unlink()
                except Exception as e:
                    log(f"⚠ 无法删除原图 {filepath.name}: {e}")

            return 'success'
            
    except Exception as e:
        log(f"✗ 处理失败 {filepath.name}: {e}")
        return 'fail'


def collect_images(directory: Path, recursive: bool = False) -> List[Path]:
    """收集目录下的所有图片文件"""
    images = []
    
    if recursive:
        for root, _, files in os.walk(directory):
            for filename in files:
                filepath = Path(root) / filename
                if filepath.suffix.lower() in SUPPORTED_EXTENSIONS:
                    images.append(filepath)
    else:
        for filepath in directory.iterdir():
            if filepath.is_file() and filepath.suffix.lower() in SUPPORTED_EXTENSIONS:
                images.append(filepath)
    
    return sorted(images)


    """简单的悬浮提示工具"""
    
    def __init__(self, widget, text):
        self.widget = widget
        self.text = text
        self.tip_window = None
        widget.bind('<Enter>', self.show_tip)
        widget.bind('<Leave>', self.hide_tip)
    
    def show_tip(self, event=None):
        if self.tip_window:
            return
        x, y, _, _ = self.widget.bbox("insert") if hasattr(self.widget, 'bbox') else (0, 0, 0, 0)
        x += self.widget.winfo_rootx() + 25
        y += self.widget.winfo_rooty() + 25
        
        self.tip_window = tw = tk.Toplevel(self.widget)
        tw.wm_overrideredirect(True)
        tw.wm_geometry(f"+{x}+{y}")
        
        label = tk.Label(
            tw,
            text=self.text,
            justify=tk.LEFT,
            background="#ffffe0",
            relief=tk.SOLID,
            borderwidth=1,
            font=("Microsoft YaHei UI", 9),
            padx=6,
            pady=4
        )
        label.pack()
    
    def hide_tip(self, event=None):
        if self.tip_window:
            self.tip_window.destroy()
            self.tip_window = None


class ResolutionDialog(tk.Toplevel):
    """分辨率输入对话框"""
    
    def __init__(self, parent, title="添加分辨率", initial_width=1024, initial_height=1024):
        super().__init__(parent)
        self.title(title)
        self.resizable(False, False)
        self.result = None
        
        # 居中显示
        self.transient(parent)
        self.grab_set()
        
        # 主框架
        frame = ttk.Frame(self, padding="20")
        frame.pack()
        
        # 宽度输入
        ttk.Label(frame, text="宽度:").grid(row=0, column=0, sticky=tk.W, pady=5)
        self.width_var = tk.StringVar(value=str(initial_width))
        self.width_entry = ttk.Entry(frame, textvariable=self.width_var, width=10)
        self.width_entry.grid(row=0, column=1, padx=5, pady=5)
        ttk.Label(frame, text="px").grid(row=0, column=2, sticky=tk.W)
        
        # 高度输入
        ttk.Label(frame, text="高度:").grid(row=1, column=0, sticky=tk.W, pady=5)
        self.height_var = tk.StringVar(value=str(initial_height))
        self.height_entry = ttk.Entry(frame, textvariable=self.height_var, width=10)
        self.height_entry.grid(row=1, column=1, padx=5, pady=5)
        ttk.Label(frame, text="px").grid(row=1, column=2, sticky=tk.W)
        
        # 按钮
        btn_frame = ttk.Frame(frame)
        btn_frame.grid(row=2, column=0, columnspan=3, pady=(15, 0))
        
        ttk.Button(btn_frame, text="确定", command=self.on_ok).pack(side=tk.LEFT, padx=5)
        ttk.Button(btn_frame, text="取消", command=self.on_cancel).pack(side=tk.LEFT, padx=5)
        
        # 绑定事件
        self.width_entry.bind('<Return>', lambda e: self.on_ok())
        self.height_entry.bind('<Return>', lambda e: self.on_ok())
        
        self.width_entry.focus_set()
        self.width_entry.select_range(0, tk.END)
        
        # 等待窗口关闭
        self.wait_window()
    
    def on_ok(self):
        """确认"""
        try:
            w = int(self.width_var.get())
            h = int(self.height_var.get())
            if w <= 0 or h <= 0:
                messagebox.showerror("错误", "宽度和高度必须大于 0")
                return
            if w > 10000 or h > 10000:
                messagebox.showerror("错误", "宽度和高度不能超过 10000")
                return
            self.result = (w, h)
            self.destroy()
        except ValueError:
            messagebox.showerror("错误", "请输入有效的数字")
    
    def on_cancel(self):
        """取消"""
        self.destroy()


class ImageProcessorGUI:
    """图形界面主类"""
    
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("训练图像缩放预处理工具")
        self.root.geometry("750x700")
        self.root.resizable(True, True)
        
        # 加载分辨率配置
        self.resolutions = load_resolutions()
        
        self.processing = False
        self.setup_ui()
        
    def setup_ui(self):
        """创建界面"""
        # 主框架
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # ===== 输入目录 =====
        input_frame = ttk.LabelFrame(main_frame, text="输入目录", padding="5")
        input_frame.pack(fill=tk.X, pady=(0, 10))
        
        self.input_dir = tk.StringVar(value=os.getcwd())
        input_entry = ttk.Entry(input_frame, textvariable=self.input_dir, width=60)
        input_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 5))
        
        ttk.Button(input_frame, text="浏览...", command=self.browse_input).pack(side=tk.RIGHT)
        
        # ===== 输出目录 =====
        output_frame = ttk.LabelFrame(main_frame, text="输出目录 (留空则覆盖原文件/生成在同目录)", padding="5")
        output_frame.pack(fill=tk.X, pady=(0, 10))
        
        self.output_dir = tk.StringVar(value="")
        output_entry = ttk.Entry(output_frame, textvariable=self.output_dir, width=60)
        output_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 5))
        
        ttk.Button(output_frame, text="浏览...", command=self.browse_output).pack(side=tk.RIGHT)
        
        # ===== 选项 =====
        options_frame = ttk.LabelFrame(main_frame, text="处理选项", padding="10")
        options_frame.pack(fill=tk.X, pady=(0, 10))
        
        # Row 1: Recursive & Resize Enable
        row1_frame = ttk.Frame(options_frame)
        row1_frame.pack(fill=tk.X, pady=(0, 5))
        
        self.recursive = tk.BooleanVar(value=False)
        ttk.Checkbutton(
            row1_frame,
            text="递归处理子目录",
            variable=self.recursive
        ).pack(side=tk.LEFT, padx=(0, 20))
        
        self.enable_resize = tk.BooleanVar(value=True)
        resize_cb = ttk.Checkbutton(
            row1_frame,
            text="启用智能缩放",
            variable=self.enable_resize,
            command=self.toggle_resize_options
        )
        resize_cb.pack(side=tk.LEFT)
        
        ToolTip(resize_cb, 
            "启用后根据预设分辨率列表缩放图片。\n"
            "禁用时仅执行格式转换或压缩，保持原图尺寸。"
        )
        # Row 2: Exact Size
        self.exact_size_frame = ttk.Frame(options_frame)
        self.exact_size_frame.pack(fill=tk.X, pady=(5, 5))
        
        self.exact_size = tk.BooleanVar(value=False)
        exact_size_cb = ttk.Checkbutton(
            self.exact_size_frame,
            text="精确裁剪到目标尺寸",
            variable=self.exact_size
        )
        exact_size_cb.pack(side=tk.LEFT)
        ToolTip(exact_size_cb, "缩放后居中裁剪，输出精确等于目标尺寸。若禁用则仅缩放保持原比例。")
        
        # Row 2.5: Renaming
        rename_frame = ttk.Frame(options_frame)
        rename_frame.pack(fill=tk.X, pady=(5, 5))
        
        self.enable_rename = tk.BooleanVar(value=False)
        rename_cb = ttk.Checkbutton(
            rename_frame,
            text="自动重命名 (文件夹名_数字)",
            variable=self.enable_rename
        )
        rename_cb.pack(side=tk.LEFT)
        ToolTip(rename_cb, 
            "启用后将图片重命名为：父文件夹名_序号\n"
            "例如：my_images_1.jpg, my_images_2.jpg"
        )

        self.delete_original = tk.BooleanVar(value=False)
        delete_cb = ttk.Checkbutton(
            rename_frame,
            text="处理后删除原图",
            variable=self.delete_original
        )
        delete_cb.pack(side=tk.LEFT, padx=(20, 0))
        ToolTip(delete_cb, "处理成功后删除原始图片文件。建议在开启自动重命名或转换格式且不设输出目录时使用。")

        self.sync_metadata = tk.BooleanVar(value=True)
        sync_cb = ttk.Checkbutton(
            rename_frame,
            text="同步处理描述文件",
            variable=self.sync_metadata
        )
        sync_cb.pack(side=tk.LEFT, padx=(20, 0))
        ToolTip(sync_cb, "自动同步重命名或移动同名的 .txt / .npz / .caption 文件。")
        
        # Row 3: Output Format & Quality
        row3_frame = ttk.Frame(options_frame)
        row3_frame.pack(fill=tk.X, pady=(10, 0))
        
        ttk.Label(row3_frame, text="输出格式:").pack(side=tk.LEFT)
        self.format_var = tk.StringVar(value="原格式")
        format_combo = ttk.Combobox(
            row3_frame,
            textvariable=self.format_var,
            values=["原格式", "JPEG (.jpg)", "WEBP (.webp)", "PNG (.png)"],
            state="readonly",
            width=12
        )
        format_combo.pack(side=tk.LEFT, padx=(5, 20))
        
        ttk.Label(row3_frame, text="质量 (JPG/WEBP):").pack(side=tk.LEFT)
        self.quality = tk.IntVar(value=95)
        quality_scale = ttk.Scale(
            row3_frame, 
            from_=1, 
            to=100, 
            orient=tk.HORIZONTAL,
            variable=self.quality,
            command=lambda v: self.quality_label.config(text=f"{int(float(v))}%")
        )
        quality_scale.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=10)
        
        self.quality_label = ttk.Label(row3_frame, text="95%", width=5)
        self.quality_label.pack(side=tk.RIGHT)
        
        # ===== 目标分辨率管理 =====
        self.res_frame = ttk.LabelFrame(main_frame, text="目标分辨率 (仅在启用缩放时有效)", padding="5")
        self.res_frame.pack(fill=tk.X, pady=(0, 10))
        
        # 分辨率列表显示
        res_list_frame = ttk.Frame(self.res_frame)
        res_list_frame.pack(fill=tk.X, pady=(0, 5))
        
        # 使用 Listbox 显示分辨率
        list_container = ttk.Frame(res_list_frame)
        list_container.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        self.res_listbox = tk.Listbox(
            list_container, 
            height=4, 
            selectmode=tk.SINGLE,
            font=('Consolas', 10)
        )
        self.res_listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        scrollbar = ttk.Scrollbar(list_container, orient=tk.VERTICAL, command=self.res_listbox.yview)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.res_listbox.config(yscrollcommand=scrollbar.set)
        
        # 分辨率操作按钮
        res_btn_frame = ttk.Frame(res_list_frame)
        res_btn_frame.pack(side=tk.RIGHT, padx=(10, 0))
        
        ttk.Button(res_btn_frame, text="添加", width=8, command=self.add_resolution).pack(pady=2)
        ttk.Button(res_btn_frame, text="编辑", width=8, command=self.edit_resolution).pack(pady=2)
        ttk.Button(res_btn_frame, text="删除", width=8, command=self.delete_resolution).pack(pady=2)
        ttk.Button(res_btn_frame, text="恢复默认", width=8, command=self.reset_resolutions).pack(pady=2)
        
        # 刷新分辨率列表
        self.refresh_resolution_list()
        
        # ===== 按钮区域 =====
        button_frame = ttk.Frame(main_frame)
        button_frame.pack(fill=tk.X, pady=(0, 10))
        
        self.start_btn = ttk.Button(
            button_frame, 
            text="开始处理", 
            command=self.start_processing,
            style='Accent.TButton'
        )
        self.start_btn.pack(side=tk.LEFT, padx=(0, 10))
        
        self.stop_btn = ttk.Button(
            button_frame, 
            text="停止", 
            command=self.stop_processing,
            state=tk.DISABLED
        )
        self.stop_btn.pack(side=tk.LEFT)
        
        ttk.Button(
            button_frame, 
            text="清空日志", 
            command=self.clear_log
        ).pack(side=tk.RIGHT)
        
        # ===== 日志区域 =====
        log_frame = ttk.LabelFrame(main_frame, text="处理日志", padding="5")
        log_frame.pack(fill=tk.BOTH, expand=True)
        
        self.log_text = scrolledtext.ScrolledText(
            log_frame, 
            height=10, 
            wrap=tk.WORD,
            font=('Consolas', 9)
        )
        self.log_text.pack(fill=tk.BOTH, expand=True)
        
        # ===== 状态栏 =====
        self.status_var = tk.StringVar(value="就绪")
        status_bar = ttk.Label(
            main_frame, 
            textvariable=self.status_var, 
            relief=tk.SUNKEN,
            anchor=tk.W,
            padding=(5, 2)
        )
        status_bar.pack(fill=tk.X, pady=(10, 0))
        
        # 进度条
        self.progress = ttk.Progressbar(main_frame, mode='determinate')
        self.progress.pack(fill=tk.X, pady=(5, 0))
    
    def toggle_resize_options(self):
        """根据是否启用缩放，切换相关选项的可见性/可用性"""
        if self.enable_resize.get():
            # Enable resolution frame elements
            for child in self.res_frame.winfo_children():
                child.configure(state=tk.NORMAL)
            # Enable exact size checkbox
            for child in self.exact_size_frame.winfo_children():
                child.configure(state=tk.NORMAL)
            self.res_listbox.configure(state=tk.NORMAL)
        else:
            # Disable resolution frame elements
            for child in self.res_frame.winfo_children():
                child.configure(state=tk.DISABLED)
            # Disable exact size checkbox
            for child in self.exact_size_frame.winfo_children():
                child.configure(state=tk.DISABLED)
            self.res_listbox.configure(state=tk.DISABLED)

    def refresh_resolution_list(self):
        """刷新分辨率列表显示"""
        self.res_listbox.delete(0, tk.END)
        # 按宽高比排序
        sorted_res = sorted(self.resolutions, key=lambda r: r[0] / r[1])
        for w, h in sorted_res:
            self.res_listbox.insert(tk.END, f"{w} × {h}")
    
    def add_resolution(self):
        """添加新分辨率"""
        dialog = ResolutionDialog(self.root, title="添加分辨率")
        if dialog.result:
            if dialog.result in self.resolutions:
                messagebox.showwarning("提示", "该分辨率已存在")
                return
            self.resolutions.append(dialog.result)
            save_resolutions(self.resolutions)
            self.refresh_resolution_list()
            self.log(f"已添加分辨率: {dialog.result[0]}×{dialog.result[1]}")
    
    def edit_resolution(self):
        """编辑选中的分辨率"""
        selection = self.res_listbox.curselection()
        if not selection:
            messagebox.showwarning("提示", "请先选择要编辑的分辨率")
            return
        
        # 获取当前选中的分辨率
        sorted_res = sorted(self.resolutions, key=lambda r: r[0] / r[1])
        old_res = sorted_res[selection[0]]
        
        dialog = ResolutionDialog(
            self.root, 
            title="编辑分辨率",
            initial_width=old_res[0],
            initial_height=old_res[1]
        )
        
        if dialog.result:
            if dialog.result != old_res and dialog.result in self.resolutions:
                messagebox.showwarning("提示", "该分辨率已存在")
                return
            
            # 替换分辨率
            idx = self.resolutions.index(old_res)
            self.resolutions[idx] = dialog.result
            save_resolutions(self.resolutions)
            self.refresh_resolution_list()
            self.log(f"已修改分辨率: {old_res[0]}×{old_res[1]} → {dialog.result[0]}×{dialog.result[1]}")
    
    def delete_resolution(self):
        """删除选中的分辨率"""
        selection = self.res_listbox.curselection()
        if not selection:
            messagebox.showwarning("提示", "请先选择要删除的分辨率")
            return
        
        if len(self.resolutions) <= 1:
            messagebox.showwarning("提示", "至少需要保留一个分辨率")
            return
        
        # 获取当前选中的分辨率
        sorted_res = sorted(self.resolutions, key=lambda r: r[0] / r[1])
        res_to_delete = sorted_res[selection[0]]
        
        if messagebox.askyesno("确认删除", f"确定要删除分辨率 {res_to_delete[0]}×{res_to_delete[1]} 吗？"):
            self.resolutions.remove(res_to_delete)
            save_resolutions(self.resolutions)
            self.refresh_resolution_list()
            self.log(f"已删除分辨率: {res_to_delete[0]}×{res_to_delete[1]}")
    
    def reset_resolutions(self):
        """恢复默认分辨率"""
        if messagebox.askyesno("确认恢复", "确定要恢复默认分辨率列表吗？\n当前自定义的分辨率将被覆盖。"):
            self.resolutions = DEFAULT_RESOLUTIONS.copy()
            save_resolutions(self.resolutions)
            self.refresh_resolution_list()
            self.log("已恢复默认分辨率列表")
    
    def browse_input(self):
        """选择输入目录"""
        directory = filedialog.askdirectory(
            title="选择要处理的图片目录",
            initialdir=self.input_dir.get() or os.getcwd()
        )
        if directory:
            self.input_dir.set(directory)
    
    def browse_output(self):
        """选择输出目录"""
        directory = filedialog.askdirectory(
            title="选择输出目录",
            initialdir=self.output_dir.get() or self.input_dir.get() or os.getcwd()
        )
        if directory:
            self.output_dir.set(directory)
    
    def log(self, message: str):
        """添加日志"""
        def _log():
            self.log_text.insert(tk.END, message + "\n")
            self.log_text.see(tk.END)
        self.root.after(0, _log)
    
    def clear_log(self):
        """清空日志"""
        self.log_text.delete(1.0, tk.END)
    
    def start_processing(self):
        """开始处理"""
        if not self.resolutions and self.enable_resize.get():
            messagebox.showerror("错误", "请至少添加一个目标分辨率")
            return
        
        input_path = Path(self.input_dir.get())
        
        if not input_path.exists():
            messagebox.showerror("错误", f"输入目录不存在:\n{input_path}")
            return
        
        output_path = None
        if self.output_dir.get().strip():
            output_path = Path(self.output_dir.get())
            output_path.mkdir(parents=True, exist_ok=True)
        
        # 收集图片
        images = collect_images(input_path, self.recursive.get())
        
        if not images:
            messagebox.showwarning(
                "提示", 
                f"未找到支持的图片文件\n支持格式: {', '.join(SUPPORTED_EXTENSIONS)}"
            )
            return
        
        self.processing = True
        self.start_btn.config(state=tk.DISABLED)
        self.stop_btn.config(state=tk.NORMAL)
        self.progress['maximum'] = len(images)
        self.progress['value'] = 0
        
        # 获取格式选项
        fmt_selection = self.format_var.get()
        target_format = 'ORIGINAL'
        if "JPEG" in fmt_selection: target_format = 'JPEG'
        elif "WEBP" in fmt_selection: target_format = 'WEBP'
        elif "PNG" in fmt_selection: target_format = 'PNG'
        
        self.log(f"找到 {len(images)} 张图片待处理")
        if self.enable_resize.get():
            self.log(f"目标分辨率: {len(self.resolutions)} 个")
        else:
            self.log("缩放已禁用 (仅转换格式/压缩)")
        self.log(f"目标格式: {target_format} | 质量: {self.quality.get()}%")
        self.log("-" * 50)
        
        # 重置重命名计数器
        self._rename_counters = {}
        
        # 在后台线程处理
        thread = threading.Thread(
            target=self._process_images,
            args=(
                images, 
                output_path, 
                self.quality.get(), 
                self.exact_size.get(),
                target_format,
                self.enable_resize.get(),
                self.enable_rename.get(),
                self.delete_original.get(),
                self.sync_metadata.get()
            ),
            daemon=True
        )
        thread.start()
    
    def _process_images(self, images: List[Path], output_dir: Optional[Path], quality: int, exact_size: bool, target_format: str, enable_resize: bool, enable_rename: bool, delete_original: bool, sync_metadata: bool):
        """后台处理图片"""
        success_count = 0
        fail_count = 0
        skip_count = 0
        
        for i, filepath in enumerate(images):
            if not self.processing:
                self.log("\n⚠ 处理已停止")
                break
            
            self.root.after(0, lambda: self.status_var.set(f"处理中: {filepath.name}"))

            # 计算新文件名：扫描已有文件找到最大编号，从其后顺延
            new_name = None
            if enable_rename:
                import re as _re_rename
                parent_name = filepath.parent.name
                dir_key = str(filepath.parent)
                target_dir = output_dir if output_dir else filepath.parent
                
                # 首次处理该目录时，扫描已有文件找最大编号
                if dir_key not in self._rename_counters:
                    re = _re_rename
                    max_num = 0
                    prefix = parent_name + '_'
                    # 扫描目标目录中已有的同前缀文件
                    if target_dir.exists():
                        for existing in target_dir.iterdir():
                            if existing.is_file() and existing.stem.startswith(prefix):
                                suffix_part = existing.stem[len(prefix):]
                                # 匹配纯数字后缀
                                m = re.match(r'^(\d+)$', suffix_part)
                                if m:
                                    num = int(m.group(1))
                                    if num > max_num:
                                        max_num = num
                    self._rename_counters[dir_key] = max_num
                
                # 检查当前文件是否已经符合 "前缀_数字" 命名模式
                prefix = parent_name + '_'
                already_named = False
                if filepath.stem.startswith(prefix):
                    suffix_part = filepath.stem[len(prefix):]
                    if _re_rename.match(r'^\d+$', suffix_part):
                        already_named = True
                
                if not already_named:
                    self._rename_counters[dir_key] += 1
                    new_name = f"{parent_name}_{self._rename_counters[dir_key]}"
                # 已经符合命名模式的文件，new_name 保持 None，后续逻辑会自动跳过或原样处理

            result = process_image(
                filepath, 
                self.resolutions, 
                output_dir, 
                quality, 
                exact_size,
                target_format,
                enable_resize,
                self.log,
                new_name=new_name,
                delete_original=delete_original,
                sync_metadata=sync_metadata
            )
            
            # 根据返回状态统计
            if result == 'success':
                success_count += 1
            elif result == 'skip':
                skip_count += 1
            else:  # 'fail'
                fail_count += 1
            
            self.root.after(0, lambda v=i+1: self.progress.configure(value=v))
        
        # 完成
        self.log("-" * 50)
        self.log(f"处理完成: 成功 {success_count} 张, 跳过 {skip_count} 张, 失败 {fail_count} 张")
        
        self.root.after(0, self._processing_done)
    
    def _processing_done(self):
        """处理完成后的清理"""
        self.processing = False
        self.start_btn.config(state=tk.NORMAL)
        self.stop_btn.config(state=tk.DISABLED)
        self.status_var.set("处理完成")
    
    def stop_processing(self):
        """停止处理"""
        self.processing = False
        self.status_var.set("正在停止...")
    
    def run(self):
        """运行主循环"""
        self.root.mainloop()


def main_cli():
    """命令行模式"""
    import argparse
    import logging
    
    parser = argparse.ArgumentParser(
        description='训练图像缩放预处理工具',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument('-d', '--directory', type=Path, default=Path('.'))
    parser.add_argument('-o', '--output', type=Path, default=None)
    parser.add_argument('-r', '--recursive', action='store_true')
    parser.add_argument('-q', '--quality', type=int, default=95)
    parser.add_argument('-f', '--format', choices=['ORIGINAL', 'JPEG', 'WEBP', 'PNG'], default='ORIGINAL', help='目标输出格式')
    parser.add_argument('--no-resize', action='store_true', help='禁用缩放处理，仅转换格式')
    parser.add_argument('--rename', action='store_true', help='启用自动重命名 (文件夹名_数字)')
    parser.add_argument('--delete-source', action='store_true', help='处理成功后删除原图')
    parser.add_argument('--no-exact-size', action='store_true', help='禁用精确裁剪模式（仅等比缩放不裁剪）')
    parser.add_argument('--resolutions', type=str, default=None, help='自定义目标分辨率列表，格式: 1024x1024,768x1344')
    parser.add_argument('--no-sync', action='store_false', dest='sync', default=True, help='不处理关联的描述文件')
    parser.add_argument('-v', '--verbose', action='store_true')
    parser.add_argument('--no-gui', action='store_true', help='强制使用命令行模式')
    
    args = parser.parse_args()
    
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        datefmt='%H:%M:%S'
    )
    
    if not args.directory.exists():
        logging.error(f"目录不存在: {args.directory}")
        sys.exit(1)
    
    if args.output:
        args.output.mkdir(parents=True, exist_ok=True)
    
    images = collect_images(args.directory, args.recursive)
    if args.resolutions:
        resolutions = [tuple(int(x.strip()) for x in r.split('x')) for r in args.resolutions.split(',') if r.strip()]
    else:
        resolutions = load_resolutions()
    
    if not images:
        logging.warning(f"未找到图片文件")
        sys.exit(0)
    
    logging.info(f"找到 {len(images)} 张图片")
    
    success = 0
    rename_counters = {}  # 按目录独立计数
    for i, img in enumerate(images):
        new_name = None
        if args.rename:
            parent_name = img.parent.name
            dir_key = str(img.parent)
            target_dir = args.output if args.output else img.parent
            
            # 首次处理该目录时，扫描已有文件找最大编号
            if dir_key not in rename_counters:
                import re as _re
                max_num = 0
                prefix = parent_name + '_'
                if target_dir.exists():
                    for existing in target_dir.iterdir():
                        if existing.is_file() and existing.stem.startswith(prefix):
                            suffix_part = existing.stem[len(prefix):]
                            _m = _re.match(r'^(\d+)$', suffix_part)
                            if _m:
                                num = int(_m.group(1))
                                if num > max_num:
                                    max_num = num
                rename_counters[dir_key] = max_num
            
            # 检查当前文件是否已经符合 "前缀_数字" 命名模式
            prefix = parent_name + '_'
            already_named = False
            if img.stem.startswith(prefix):
                suffix_part = img.stem[len(prefix):]
                if _re.match(r'^\d+$', suffix_part):
                    already_named = True
            
            if not already_named:
                rename_counters[dir_key] += 1
                new_name = f"{parent_name}_{rename_counters[dir_key]}"

        res = process_image(
            img, 
            resolutions, 
            args.output, 
            args.quality, 
            exact_size=not args.no_exact_size, 
            target_format=args.format,
            enable_resize=not args.no_resize,
            new_name=new_name,
            delete_original=args.delete_source,
            sync_metadata=args.sync
        )
        if res == 'success':
            success += 1
            
    logging.info(f"完成: 成功 {success}/{len(images)}")


def main():
    """主入口"""
    # 检查是否有命令行参数（除了脚本名）
    has_args = len(sys.argv) > 1
    
    # 如果有参数或没有 GUI 支持，使用命令行模式
    if has_args or not HAS_GUI:
        main_cli()
    else:
        # 双击运行时启动 GUI
        app = ImageProcessorGUI()
        app.run()


if __name__ == "__main__":
    main()
