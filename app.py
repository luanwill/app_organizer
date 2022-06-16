class OrganizeFolders:

    def __init__(self) -> None:

        from os.path import join
        from os import makedirs
        from os.path import exists

        self.join = join
        self.makedirs = makedirs
        self.exists = exists
        self.files_inf = {}

    
    def extensions_modify(self, ext) -> None:        

        self.files_inf[ext] = []
        

    def read_file_path(self, file_path):

        from os import walk

        from os.path import splitext, getmtime, getctime

        # splitext = get extension 
        # getctime = creation date
        # getmtime = last modified         

        from time import ctime, strptime
        


        for root, dirs, files in walk(file_path):

            for file in files:

                extension = splitext(file)[1]

                if not extension in ('.pdf', '.xlsx'):
                    
                    return

                creation_date = self.convert_date(getctime(self.join(root, file)))

                last_modify_date = self.convert_date(getmtime(self.join(root, file)))                

                try:

                    self.files_inf[extension].append({
                    'root':root, 
                    'file':file,
                    'ext':extension,
                    'creation_date':creation_date,
                    'last_modify_date':last_modify_date                
                    })

                except:                    

                    self.extensions_modify(extension)
                    self.files_inf[extension].append({
                    'root':root, 
                    'file':file, 
                    'ext':extension,
                    'creation_date':creation_date,
                    'last_modify_date':last_modify_date                
                    })

    @staticmethod
    def convert_date(date_in_timestamp) -> str:

        from time import ctime, strptime, strftime        

        date_converted = strptime(ctime(date_in_timestamp), "%a %b %d %H:%M:%S %Y")        

        return strftime("%Y.%m.%d", date_converted)
                    

    def mk_dir_to_ext(self, destiny):

        for ext in self.files_inf:

            self.mk_dir(f'{destiny}/{ext}')


    def mk_dir_to_creation_date(self, destiny):

        for files in self.files_inf.values():

            for data_files in files:

                self.mk_dir(f"{destiny}/{data_files['creation_date']}") 

        
    def mk_dir_to_last_modify_date(self, destiny):

        for files in self.files_inf.values():

            for data_files in files:

                self.mk_dir(f"{destiny}/{data_files['last_modify_date']}") 
    
    def mk_dir(self, dir):

            if not self.exists(dir):

                self.makedirs(dir)

    def organizer_to_ext(self, destiny):

        from os import rename

        self.mk_dir_to_ext(destiny=destiny)

        for files in self.files_inf.values():

            for data_files in files:

                rename(self.join(data_files['root'], data_files['file']), self.join(f"{destiny}\\{data_files['ext']}", data_files['file']))

  









                    
    
    
    
                



app = OrganizeFolders()

app.read_file_path(r'S:\arthur\arthur')
app.organizer_to_ext(r'C:\Users\rol\Downloads')
